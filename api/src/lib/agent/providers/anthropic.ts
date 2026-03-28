/**
 * Anthropic provider loop — uses @anthropic-ai/sdk directly.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { AgentConfig, AgentDemoEvent } from "../types";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  }
  return _client;
}

type MessageParam = Anthropic.MessageParam;
type ContentBlockParam = Anthropic.ContentBlockParam;
type ToolResultBlockParam = Anthropic.ToolResultBlockParam;

export type AnthropicLoopDependencies = {
  createMessage: (params: {
    model: string;
    max_tokens: number;
    system: string;
    tools: unknown[];
    messages: unknown[];
  }) => Promise<{ content: unknown[]; usage?: { input_tokens: number; output_tokens: number }; stop_reason?: string }>;
  delayMs: (ms: number) => Promise<void>;
  now: () => number;
  maxApiRetries: number;
};

function resolveAnthropicDeps(deps?: Partial<AnthropicLoopDependencies>): AnthropicLoopDependencies {
  return {
    createMessage: deps?.createMessage ?? ((params) => getClient().messages.create(params) as Promise<{ content: unknown[]; usage?: { input_tokens: number; output_tokens: number }; stop_reason?: string }>),
    delayMs: deps?.delayMs ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    now: deps?.now ?? (() => Date.now()),
    maxApiRetries: deps?.maxApiRetries ?? 5,
  };
}

export async function runAnthropicLoop(
  config: AgentConfig,
  question: string,
  model: string,
  deps?: Partial<AnthropicLoopDependencies>,
): Promise<void> {
  const d = resolveAnthropicDeps(deps);
  const { side, systemPrompt, tools, executeTool, maxTurns, onEvent } = config;
  const startTime = d.now();
  const elapsed = () => d.now() - startTime;

  const emit = (partial: Omit<AgentDemoEvent, "side" | "elapsed_ms">) =>
    onEvent({ side, elapsed_ms: elapsed(), ...partial });

  const messages: MessageParam[] = [{ role: "user", content: question }];

  for (let turn = 0; turn < maxTurns; turn++) {
    emit({ type: "thinking" });

    let response: { content: unknown[]; usage?: { input_tokens: number; output_tokens: number }; stop_reason?: string };
    let apiRetries = 0;
    while (true) {
      try {
        response = await d.createMessage({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema,
          })),
          messages,
        });
        break; // success
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const is429 = msg.includes("429") || msg.includes("rate") || msg.includes("Rate") || msg.includes("overloaded");
        if (is429 && apiRetries < d.maxApiRetries) {
          apiRetries++;
          const delayMs = Math.min(2000 * Math.pow(2, apiRetries - 1), 30000);
          emit({ type: "text", content: `Rate limited, waiting ${Math.round(delayMs / 1000)}s...` });
          await d.delayMs(delayMs);
          continue;
        }
        emit({ type: "error", content: `API error: ${msg}` });
        emit({ type: "done" });
        return;
      }
    }

    // Emit token usage
    if (response.usage) {
      emit({
        type: "usage",
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      });
    }

    // Process content blocks
    const toolUseBlocks: Array<{
      id: string;
      name: string;
      input: Record<string, unknown>;
    }> = [];

    for (const rawBlock of response.content) {
      const block = rawBlock as { type: string; text?: string; id?: string; name?: string; input?: unknown };
      if (block.type === "text") {
        emit({ type: "text", content: block.text! });
      } else if (block.type === "tool_use") {
        toolUseBlocks.push({
          id: block.id!,
          name: block.name!,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    // If no tool use, we're done
    if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
      emit({ type: "done" });
      return;
    }

    // Execute tools and build results
    messages.push({ role: "assistant", content: response.content as ContentBlockParam[] });

    const toolResults: ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      emit({
        type: "tool_call",
        tool_name: toolUse.name,
        tool_input: toolUse.input,
      });

      let result: string;
      let isError = false;
      try {
        result = await executeTool(toolUse.name, toolUse.input);
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : String(err)}`;
        isError = true;
      }

      const preview =
        result.length > 500 ? result.slice(0, 500) + "..." : result;

      emit({
        type: "tool_result",
        tool_name: toolUse.name,
        tool_output_preview: preview,
      });

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result,
        is_error: isError,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  // Hit max turns
  emit({
    type: "text",
    content: "I've reached my maximum number of steps. Here's what I found so far based on my research above.",
  });
  emit({ type: "done" });
}
