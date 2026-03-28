/**
 * Shared types for the AI Agent system.
 */

/** Which side of the comparison this event belongs to */
export type AgentSide = "left" | "right" | "explorer";

/** Event types emitted during an agent loop */
export type AgentEventType =
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "text"
  | "error"
  | "done"
  | "usage";

/** A single event streamed from the agent demo */
export interface AgentDemoEvent {
  side: AgentSide;
  type: AgentEventType;
  content?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_output_preview?: string;
  elapsed_ms?: number;
  /** Token usage from this API call (only on "usage" events) */
  input_tokens?: number;
  output_tokens?: number;
}

/** Stream-end sentinel (no side) */
export interface StreamEndEvent {
  type: "stream:end";
}

/** Canonical tool definition — provider-agnostic, maps to all providers */
export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** Configuration for a single agent loop */
export interface AgentConfig {
  side: AgentSide;
  systemPrompt: string;
  tools: ToolDef[];
  executeTool: (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<string>;
  maxTurns: number;
  onEvent: (event: AgentDemoEvent) => void;
  /** Model ID to use — defaults to AGENT_MODEL env or claude-sonnet-4-5-20250929 */
  model?: string;
}
