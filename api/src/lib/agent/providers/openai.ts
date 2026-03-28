/**
 * OpenAI-compatible provider loop — covers OpenAI and Gemini (via baseURL).
 */
import OpenAI from "openai";
import type { AgentConfig, AgentDemoEvent } from "../types";
import type { ToolDef } from "./types";
import { getModelInfo } from "./models";

// Cached clients per provider
let _openaiClient: OpenAI | null = null;
let _geminiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    _openaiClient = new OpenAI(); // reads OPENAI_API_KEY from env
  }
  return _openaiClient;
}

function getGeminiClient(): OpenAI {
  if (!_geminiClient) {
    _geminiClient = new OpenAI({
      apiKey: process.env.GEMINI_API_KEY || "",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
  }
  return _geminiClient;
}

/** Convert our canonical ToolDef to OpenAI's tool format */
function toOpenAITools(tools: ToolDef[]): OpenAI.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  }));
}

export type OpenAILoopDependencies = {
  createChatCompletion: (params: unknown) => Promise<{ choices: unknown[]; usage?: { prompt_tokens: number; completion_tokens: number } }>;
  delayMs: (ms: number) => Promise<void>;
  now: () => number;
  maxApiRetries: number;
};

function resolveOpenAIDeps(model: string, deps?: Partial<OpenAILoopDependencies>): OpenAILoopDependencies {
  return {
    createChatCompletion: deps?.createChatCompletion ?? ((params) => {
      const info = getModelInfo(model);
      const client = info?.provider === "gemini" ? getGeminiClient() : getOpenAIClient();
      return client.chat.completions.create(params as OpenAI.ChatCompletionCreateParamsNonStreaming) as Promise<{ choices: unknown[]; usage?: { prompt_tokens: number; completion_tokens: number } }>;
    }),
    delayMs: deps?.delayMs ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    now: deps?.now ?? (() => Date.now()),
    maxApiRetries: deps?.maxApiRetries ?? 5,
  };
}

export async function runOpenAILoop(
  config: AgentConfig,
  question: string,
  model: string,
  deps?: Partial<OpenAILoopDependencies>,
): Promise<void> {
  const d = resolveOpenAIDeps(model, deps);
  const { side, systemPrompt, tools, executeTool, maxTurns, onEvent } = config;
  const startTime = d.now();
  const elapsed = () => d.now() - startTime;

  const emit = (partial: Omit<AgentDemoEvent, "side" | "elapsed_ms">) =>
    onEvent({ side, elapsed_ms: elapsed(), ...partial });

  const openAITools = toOpenAITools(tools as ToolDef[]);

  // Newer OpenAI models (gpt-5*, o3*, o4*) use max_completion_tokens instead of max_tokens
  const usesNewTokenParam = /^(gpt-5|o[34])/.test(model);
  const tokenParam = usesNewTokenParam
    ? { max_completion_tokens: 4096 }
    : { max_tokens: 4096 };

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: question },
  ];

  for (let turn = 0; turn < maxTurns; turn++) {
    emit({ type: "thinking" });

    let response: { choices: unknown[]; usage?: { prompt_tokens: number; completion_tokens: number } };
    let apiRetries = 0;
    while (true) {
      try {
        response = await d.createChatCompletion({
          model,
          ...tokenParam,
          tools: openAITools,
          messages,
        });
        break; // success
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const is429 = msg.includes("429") || msg.includes("rate") || msg.includes("Rate");
        if (is429 && apiRetries < d.maxApiRetries) {
          apiRetries++;
          const delayMs = Math.min(2000 * Math.pow(2, apiRetries - 1), 30000); // 2s, 4s, 8s, 16s, 30s
          emit({ type: "text", content: `Rate limited, waiting ${Math.round(delayMs / 1000)}s...` });
          await d.delayMs(delayMs);
          continue;
        }
        emit({ type: "error", content: `API error: ${msg}` });
        emit({ type: "done" });
        return;
      }
    }

    // Emit token usage (normalize OpenAI field names)
    if (response.usage) {
      emit({
        type: "usage",
        input_tokens: response.usage.prompt_tokens,
        output_tokens: response.usage.completion_tokens,
      });
    }

    const choice = response.choices[0] as {
      message: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
      finish_reason?: string;
    } | undefined;
    if (!choice) {
      emit({ type: "error", content: "No response from model" });
      emit({ type: "done" });
      return;
    }

    const message = choice.message;

    // Emit text content
    if (message.content) {
      emit({ type: "text", content: message.content });
    }

    // If no tool calls, we're done
    const toolCalls = message.tool_calls || [];
    if (choice.finish_reason === "stop" || toolCalls.length === 0) {
      emit({ type: "done" });
      return;
    }

    // Add assistant message to history
    messages.push(message as OpenAI.ChatCompletionMessageParam);

    // Execute tools and build results
    for (const toolCall of toolCalls) {
      const fnName = toolCall.function.name;
      let fnArgs: Record<string, unknown>;
      try {
        fnArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        fnArgs = {};
      }

      emit({
        type: "tool_call",
        tool_name: fnName,
        tool_input: fnArgs,
      });

      let result: string;
      try {
        result = await executeTool(fnName, fnArgs);
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }

      const preview =
        result.length > 500 ? result.slice(0, 500) + "..." : result;

      emit({
        type: "tool_result",
        tool_name: fnName,
        tool_output_preview: preview,
      });

      // OpenAI expects tool results as individual messages with role: "tool"
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }

  // Hit max turns
  emit({
    type: "text",
    content: "I've reached my maximum number of steps. Here's what I found so far based on my research above.",
  });
  emit({ type: "done" });
}
