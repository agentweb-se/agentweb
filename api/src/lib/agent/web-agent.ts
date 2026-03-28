/**
 * Left side agent — baseline AI assistant.
 * Gets the URL and a fetch tool, but NO site knowledge (no agents.json).
 */
import type { AgentConfig, AgentDemoEvent } from "./types";
import { FETCH_URL_TOOL, createFetchExecutor as defaultCreateFetchExecutor } from "./fetch-tool";
import { buildBaseSystemPrompt as defaultBuildBaseSystemPrompt } from "./prompts";
import { runAgentLoop as defaultRunAgentLoop } from "./loop";

// --- Dependency injection ---

export type WebAgentDependencies = {
  buildBaseSystemPrompt: typeof defaultBuildBaseSystemPrompt;
  createFetchExecutor: typeof defaultCreateFetchExecutor;
  runAgentLoop: typeof defaultRunAgentLoop;
};

function resolveWebAgentDeps(overrides?: Partial<WebAgentDependencies>): WebAgentDependencies {
  return {
    buildBaseSystemPrompt: overrides?.buildBaseSystemPrompt ?? defaultBuildBaseSystemPrompt,
    createFetchExecutor: overrides?.createFetchExecutor ?? defaultCreateFetchExecutor,
    runAgentLoop: overrides?.runAgentLoop ?? defaultRunAgentLoop,
  };
}

// --- Public API ---

export function startWebAgent(
  siteUrl: string,
  domain: string,
  question: string,
  onEvent: (event: AgentDemoEvent) => void,
  model?: string,
  deps?: Partial<WebAgentDependencies>,
): Promise<void> {
  const d = resolveWebAgentDeps(deps);
  const config: AgentConfig = {
    side: "left",
    systemPrompt: d.buildBaseSystemPrompt(siteUrl, domain),
    tools: [FETCH_URL_TOOL],
    executeTool: d.createFetchExecutor(domain),
    maxTurns: 10,
    onEvent,
    model,
  };

  return d.runAgentLoop(config, question);
}
