/**
 * Right side agent — AI assistant with AgentWeb operating manual.
 *
 * The agents.json IS the product. A blank agent + agents.json + fetch = fully operational.
 */
import type { AgentConfig, AgentDemoEvent } from "./types";
import { buildAgentsJsonSystemPrompt as defaultBuildAgentsJsonSystemPrompt } from "./prompts";
import { runAgentLoop as defaultRunAgentLoop } from "./loop";
import { readAgentsJson as defaultReadAgentsJson } from "../agent-docs/reader.js";
import { FETCH_URL_TOOL, createFetchExecutor as defaultCreateFetchExecutor, extractApiDomains as defaultExtractApiDomains } from "./fetch-tool";

// --- Dependency injection ---

export type McpAgentDependencies = {
  readAgentsJson: typeof defaultReadAgentsJson;
  buildAgentsJsonSystemPrompt: typeof defaultBuildAgentsJsonSystemPrompt;
  createFetchExecutor: typeof defaultCreateFetchExecutor;
  extractApiDomains: typeof defaultExtractApiDomains;
  runAgentLoop: typeof defaultRunAgentLoop;
};

function resolveMcpAgentDeps(overrides?: Partial<McpAgentDependencies>): McpAgentDependencies {
  return {
    readAgentsJson: overrides?.readAgentsJson ?? defaultReadAgentsJson,
    buildAgentsJsonSystemPrompt: overrides?.buildAgentsJsonSystemPrompt ?? defaultBuildAgentsJsonSystemPrompt,
    createFetchExecutor: overrides?.createFetchExecutor ?? defaultCreateFetchExecutor,
    extractApiDomains: overrides?.extractApiDomains ?? defaultExtractApiDomains,
    runAgentLoop: overrides?.runAgentLoop ?? defaultRunAgentLoop,
  };
}

// --- Public API ---

/**
 * agents.json mode — the primary demo mode.
 *
 * The agent gets:
 * - The site URL (same as LEFT)
 * - A fetch_url tool (same as LEFT)
 * - The agents.json operating manual (the ONLY advantage over LEFT)
 *
 * That's it. No extra coaching. If agents.json is good, this agent wins.
 */
export function startAgentsJsonAgent(
  siteUrl: string,
  domain: string,
  question: string,
  onEvent: (event: AgentDemoEvent) => void,
  model?: string,
  deps?: Partial<McpAgentDependencies>,
): Promise<void> {
  const d = resolveMcpAgentDeps(deps);
  const agentsJson = d.readAgentsJson(domain);
  if (!agentsJson) throw new Error(`No agents.json found for ${domain}`);

  // Extract external API domains from agents.json (e.g., algolia.net)
  // so the fetch tool can call documented API endpoints
  const allowedDomains = d.extractApiDomains(agentsJson);

  const config: AgentConfig = {
    side: "right",
    systemPrompt: d.buildAgentsJsonSystemPrompt(siteUrl, domain, agentsJson),
    tools: [FETCH_URL_TOOL],
    executeTool: d.createFetchExecutor(domain, allowedDomains),
    maxTurns: 15,
    onEvent,
    model,
  };

  return d.runAgentLoop(config, question);
}
