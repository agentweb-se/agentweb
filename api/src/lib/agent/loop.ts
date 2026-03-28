/**
 * Agent loop dispatcher — routes to the correct provider based on model ID.
 */
import type { AgentConfig } from "./types";
import { runAnthropicLoop, type AnthropicLoopDependencies } from "./providers/anthropic";
import { runOpenAILoop, type OpenAILoopDependencies } from "./providers/openai";
import { getModelInfo, DEFAULT_MODEL } from "./providers/models";

// --- Dependency injection ---

export type AgentLoopDependencies = {
  runAnthropicLoop: (config: AgentConfig, question: string, model: string, deps?: Partial<AnthropicLoopDependencies>) => Promise<void>;
  runOpenAILoop: (config: AgentConfig, question: string, model: string, deps?: Partial<OpenAILoopDependencies>) => Promise<void>;
  getModelInfo: (modelId: string) => { provider: string } | undefined;
  defaultModel: string;
  agentModelOverride: string | undefined;
  /** Provider-level deps — threaded through to the actual provider loop */
  anthropicDeps?: Partial<AnthropicLoopDependencies>;
  openaiDeps?: Partial<OpenAILoopDependencies>;
};

function resolveAgentLoopDeps(overrides?: Partial<AgentLoopDependencies>): AgentLoopDependencies {
  return {
    runAnthropicLoop: overrides?.runAnthropicLoop ?? runAnthropicLoop,
    runOpenAILoop: overrides?.runOpenAILoop ?? runOpenAILoop,
    getModelInfo: overrides?.getModelInfo ?? getModelInfo,
    defaultModel: overrides?.defaultModel ?? DEFAULT_MODEL,
    agentModelOverride: overrides?.agentModelOverride ?? process.env.AGENT_MODEL,
    anthropicDeps: overrides?.anthropicDeps,
    openaiDeps: overrides?.openaiDeps,
  };
}

// --- Public API ---

/**
 * Run a multi-turn tool-use conversation until the model produces a
 * final answer or we hit maxTurns. Automatically selects the right
 * provider (Anthropic, OpenAI, Gemini) based on the model ID.
 */
export async function runAgentLoop(
  config: AgentConfig,
  question: string,
  deps?: Partial<AgentLoopDependencies>,
): Promise<void> {
  const d = resolveAgentLoopDeps(deps);
  const modelId = config.model || d.agentModelOverride || d.defaultModel;
  const info = d.getModelInfo(modelId);

  if (!info) {
    throw new Error(
      `Unknown model: "${modelId}". Check AGENT_MODEL env var or AgentConfig.model.`
    );
  }

  switch (info.provider) {
    case "anthropic":
      return d.runAnthropicLoop(config, question, modelId, d.anthropicDeps);
    case "openai":
    case "gemini":
      return d.runOpenAILoop(config, question, modelId, d.openaiDeps);
    default:
      throw new Error(`Unsupported provider: ${info.provider}`);
  }
}
