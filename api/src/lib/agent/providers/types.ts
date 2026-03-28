/**
 * Provider-agnostic types for the multi-model agent system.
 */
import type { AgentConfig, AgentDemoEvent } from "../types";

/** Canonical tool definition — same shape as Anthropic's, maps cleanly to all providers */
export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** Model provider identifier */
export type ModelProvider = "anthropic" | "openai" | "gemini";

/** Speed/quality tier */
export type ModelTier = "flagship" | "balanced" | "fast" | "reasoning";

/** Model metadata — used for registry lookups, cost calculation, and UI display */
export interface ModelInfo {
  id: string;
  provider: ModelProvider;
  name: string;
  tier: ModelTier;
  inputCostPer1M: number;   // USD per 1M input tokens
  outputCostPer1M: number;  // USD per 1M output tokens
  maxOutputTokens: number;
  supportsTools: boolean;
}

/** Provider loop function signature — each provider implements this */
export type ProviderLoop = (
  config: AgentConfig,
  question: string,
  model: string,
) => Promise<void>;
