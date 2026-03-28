/**
 * Model catalog — single source of truth for all supported models.
 *
 * Add a model:    add a row with m(...)
 * Update pricing: edit the numbers in the row
 *
 * Pricing sources:
 *   Anthropic — https://docs.anthropic.com/en/docs/about-claude/pricing
 *   OpenAI    — https://openai.com/api/pricing/
 *   Gemini    — https://ai.google.dev/pricing
 *
 * Last updated: 2026-03-14
 */
import type { ModelInfo, ModelProvider, ModelTier } from "./types";

export const DEFAULT_MODEL = "claude-sonnet-4-6";

function m(id: string, provider: ModelProvider, name: string, tier: ModelTier, inCost: number, outCost: number, maxOut: number): ModelInfo {
  return { id, provider, name, tier, inputCostPer1M: inCost, outputCostPer1M: outCost, maxOutputTokens: maxOut, supportsTools: true };
}

//                                                                                                   $/1M in  $/1M out  max out
const MODELS: ModelInfo[] = [
  // ── Anthropic ─────────────────────────────────────────────────────────────────────────────────────────────────
  m("claude-opus-4-6",              "anthropic", "Claude Opus 4.6",        "flagship",     5,      25,    128000),
  m("claude-sonnet-4-6",            "anthropic", "Claude Sonnet 4.6",      "balanced",     3,      15,     64000),
  m("claude-haiku-4-5-20251001",    "anthropic", "Claude Haiku 4.5",       "fast",         1,       5,     64000),
  m("claude-sonnet-4-5-20250929",   "anthropic", "Claude Sonnet 4.5",      "balanced",     3,      15,     64000),
  m("claude-sonnet-4-20250514",     "anthropic", "Claude Sonnet 4",        "balanced",     3,      15,     64000),
  m("claude-opus-4-20250514",       "anthropic", "Claude Opus 4",          "flagship",    15,      75,     32000),

  // ── OpenAI ────────────────────────────────────────────────────────────────────────────────────────────────────
  m("gpt-5.4",                      "openai",   "GPT-5.4",                "flagship",   2.50,     15,    128000),
  m("gpt-5-mini",                   "openai",   "GPT-5 Mini",             "balanced",   0.25,      2,    128000),
  m("gpt-4.1",                      "openai",   "GPT-4.1",                "flagship",      2,      8,     32768),
  m("gpt-4.1-mini",                 "openai",   "GPT-4.1 Mini",           "balanced",   0.40,   1.60,     32768),
  m("gpt-4.1-nano",                 "openai",   "GPT-4.1 Nano",           "fast",       0.10,   0.40,     32768),
  m("gpt-4o",                       "openai",   "GPT-4o",                 "flagship",   2.50,     10,     16384),
  m("gpt-4o-mini",                  "openai",   "GPT-4o Mini",            "fast",       0.15,   0.60,     16384),
  m("o4-mini",                      "openai",   "o4-mini",                "reasoning",  1.10,   4.40,    100000),
  m("o3",                           "openai",   "o3",                     "reasoning",     2,      8,    100000),
  m("o3-mini",                      "openai",   "o3-mini",                "reasoning",  1.10,   4.40,    100000),
  m("o3-pro",                       "openai",   "o3-pro",                 "flagship",     20,     80,    100000),

  // ── Gemini (via OpenAI-compatible endpoint) ───────────────────────────────────────────────────────────────────
  m("gemini-3.1-pro-preview",       "gemini",   "Gemini 3.1 Pro",         "flagship",      2,     12,     65536),
  m("gemini-3-flash-preview",       "gemini",   "Gemini 3 Flash",         "balanced",   0.50,      3,     65536),
  m("gemini-3.1-flash-lite-preview","gemini",   "Gemini 3.1 Flash-Lite",  "fast",       0.25,   1.50,     65536),
  m("gemini-2.5-pro",               "gemini",   "Gemini 2.5 Pro",         "flagship",   1.25,     10,     65536),
  m("gemini-2.5-flash",             "gemini",   "Gemini 2.5 Flash",       "balanced",   0.30,   2.50,     65536),
  m("gemini-2.5-flash-lite",        "gemini",   "Gemini 2.5 Flash-Lite",  "fast",       0.10,   0.40,     65536),
  m("gemini-2.0-flash",             "gemini",   "Gemini 2.0 Flash",       "fast",       0.10,   0.40,      8192),
];

const MODEL_MAP = new Map<string, ModelInfo>(MODELS.map((v) => [v.id, v]));

export function getModelInfo(modelId: string): ModelInfo | undefined {
  return MODEL_MAP.get(modelId);
}

export function getModelCost(modelId: string): { inputPer1M: number; outputPer1M: number } {
  const info = MODEL_MAP.get(modelId);
  if (!info) return { inputPer1M: 3, outputPer1M: 15 };
  return { inputPer1M: info.inputCostPer1M, outputPer1M: info.outputCostPer1M };
}

export function getAllModels(): ModelInfo[] {
  return [...MODELS];
}

/** Resolve the model for a given explorer phase from env vars */
export function getPhaseModel(phase: string): string {
  const envKey = `EXPLORER_${phase.toUpperCase()}_MODEL`;
  return process.env[envKey] || process.env.AGENT_MODEL || DEFAULT_MODEL;
}
