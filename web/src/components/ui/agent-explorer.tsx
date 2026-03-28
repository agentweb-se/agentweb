"use client";

import React, { useCallback, useRef, useState } from "react";
import { Loader2, XCircle, Bug, Zap } from "lucide-react";
import { AgentLogPanel, type LogEntry } from "@/components/ui/agent-log-panel";
import { AgentDocPanel } from "@/components/ui/agent-doc-panel";
import { IS_DEV_MODE } from "@/lib/dev-mode";
import {
  PhaseProgressPanel,
  type PhaseState,
  type PhaseStatus,
} from "@/components/ui/phase-progress-panel";

type DocSection = {
  section: string;
  data: unknown;
};

type LeftTab = "progress" | "debug";

type Props = {
  url: string;
  onComplete?: () => void;
  /** Per-phase model overrides — sent to backend */
  models?: Record<string, string>;
};

// Typical tool call counts per phase (used to scale progress to 0-90%)
// Based on real run data — these are "write and stop" counts, not "explore everything"
const EXPECTED_TOOL_CALLS: Record<string, number> = {
  manifesto: 5,
  search: 15,
  browse: 12,
  forms: 20,
  contact: 10,
};

const INITIAL_PHASES: PhaseState[] = [
  { id: "manifesto", label: "Site Identity", sublabel: "Waiting...", status: "waiting", retries: 0, progress: 0, steps: 0, expectedSteps: EXPECTED_TOOL_CALLS.manifesto, isThinking: false },
  { id: "search", label: "Search API", sublabel: "Waiting...", status: "waiting", retries: 0, progress: 0, steps: 0, expectedSteps: EXPECTED_TOOL_CALLS.search, isThinking: false },
  { id: "browse", label: "Navigation", sublabel: "Waiting...", status: "waiting", retries: 0, progress: 0, steps: 0, expectedSteps: EXPECTED_TOOL_CALLS.browse, isThinking: false },
  { id: "forms", label: "Filters & Sorting", sublabel: "Waiting...", status: "waiting", retries: 0, progress: 0, steps: 0, expectedSteps: EXPECTED_TOOL_CALLS.forms, isThinking: false },
  { id: "contact", label: "Contact Info", sublabel: "Waiting...", status: "waiting", retries: 0, progress: 0, steps: 0, expectedSteps: EXPECTED_TOOL_CALLS.contact, isThinking: false },
];

// Map tool names to human-readable sublabels
function toolToSublabel(toolName: string, phase: string): string {
  switch (toolName) {
    case "fetch_page": return "Fetching a page...";
    case "browser_action":
      return phase === "search" ? "Interacting with the browser..."
        : phase === "forms" ? "Testing filter controls..."
        : phase === "contact" ? "Browsing the site..."
        : phase === "browse" ? "Visiting a category..."
        : "Browsing...";
    case "http_request": return "Verifying an endpoint...";
    case "write_section": return "Writing results...";
    default: return "Working...";
  }
}

type ModelPricing = Record<string, { inputPer1M: number; outputPer1M: number }>;

export function AgentExplorer({ url, onComplete, models }: Props) {
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [docSections, setDocSections] = useState<DocSection[]>([]);
  const [fullDoc, setFullDoc] = useState<Record<string, unknown>>({});
  const [isComplete, setIsComplete] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveTokens, setLiveTokens] = useState({ input: 0, output: 0 });
  const [runningCost, setRunningCost] = useState(0);
  const [phases, setPhases] = useState<PhaseState[]>(INITIAL_PHASES.map(p => ({ ...p })));
  const [leftTab, setLeftTab] = useState<LeftTab>("progress");
  const [completionData, setCompletionData] = useState<{ wallTimeMs?: number; costDisplay?: string }>({});
  const abortRef = useRef<AbortController | null>(null);
  const hasStartedRef = useRef(false);
  const modelPricingRef = useRef<ModelPricing>({});

  // Fetch model pricing on mount so we can calculate accurate running costs
  React.useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
    fetch(`${apiUrl}/api/agent/models`)
      .then((r) => r.json())
      .then((data: { models: Array<{ id: string; inputCostPer1M: number; outputCostPer1M: number }> }) => {
        const pricing: ModelPricing = {};
        for (const m of data.models) {
          pricing[m.id] = { inputPer1M: m.inputCostPer1M, outputPer1M: m.outputCostPer1M };
        }
        modelPricingRef.current = pricing;
      })
      .catch(() => {});
  }, []);

  /** Calculate cost for a single usage event using the actual model's pricing */
  function calcUsageCost(phase: string, inputTokens: number, outputTokens: number): number {
    const modelId = models?.[phase] || "claude-sonnet-4-6";
    const pricing = modelPricingRef.current[modelId];
    if (!pricing) {
      // Fallback to Sonnet pricing if model not found
      return (inputTokens * 3 + outputTokens * 15) / 1_000_000;
    }
    return (inputTokens * pricing.inputPer1M + outputTokens * pricing.outputPer1M) / 1_000_000;
  }

  function updatePhase(phaseId: string, updates: Partial<PhaseState>) {
    setPhases(prev => prev.map(p =>
      p.id === phaseId ? { ...p, ...updates } : p
    ));
  }

  // Advance progress based on actual tool calls
  function handleToolCall(phaseId: string, toolName: string) {
    setPhases(prev => prev.map(p => {
      if (p.id !== phaseId || p.status !== "running") return p;
      const newSteps = p.steps + 1;
      const progress = Math.min(90, Math.round((newSteps / p.expectedSteps) * 90));
      return {
        ...p,
        steps: newSteps,
        progress,
        sublabel: toolToSublabel(toolName, phaseId),
        isThinking: false,
      };
    }));
  }

  // Mark phase as thinking (agent is between tool calls)
  function handleThinking(phaseId: string) {
    setPhases(prev => prev.map(p =>
      p.id === phaseId && p.status === "running"
        ? { ...p, isThinking: true }
        : p
    ));
  }

  // Flash a section write milestone on the phase card
  function handleSectionWrite(phaseId: string, sectionName: string) {
    updatePhase(phaseId, {
      progress: 90,
      sublabel: `Wrote ${sectionName}`,
      lastSection: sectionName,
      isThinking: false,
    });
  }

  const startExplorer = useCallback(async () => {
    if (isRunning || hasStartedRef.current) return;
    hasStartedRef.current = true;

    setIsRunning(true);
    setError(null);
    setLogEntries([]);
    setDocSections([]);
    setFullDoc({});
    setIsComplete(false);
    setLiveTokens({ input: 0, output: 0 });
    setRunningCost(0);
    setPhases(INITIAL_PHASES.map(p => ({ ...p })));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const resp = await fetch(`${apiUrl}/api/agent/explore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, models }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        setError(data.error || `Request failed (${resp.status})`);
        setIsRunning(false);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) {
        setError("No response stream");
        setIsRunning(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;

          try {
            const event = JSON.parse(json);

            // Stream end
            if (event.type === "stream:end") {
              setIsComplete(true);
              setIsRunning(false);
              onComplete?.();
              return;
            }

            // Section written — update doc panel + flash milestone
            if (event.type === "section-written") {
              const section = event.section as string;
              const data = event.data;

              setDocSections((prev) => {
                const existing = prev.findIndex((s) => s.section === section);
                if (existing >= 0) {
                  const next = [...prev];
                  next[existing] = { section, data };
                  return next;
                }
                return [...prev, { section, data }];
              });

              setFullDoc((prev) => {
                const next = { ...prev };
                setNestedValue(next, section, data);
                return next;
              });

              // Flash section milestone on progress card
              const writePhase = event.phase as string | undefined;
              if (writePhase) {
                handleSectionWrite(writePhase, section);
              }
            }

            // Track live tokens + accumulate accurate cost per call
            if (event.type === "usage") {
              const inTok = event.input_tokens || 0;
              const outTok = event.output_tokens || 0;
              setLiveTokens((prev) => ({
                input: prev.input + inTok,
                output: prev.output + outTok,
              }));
              const callCost = calcUsageCost(event.phase || "", inTok, outTok);
              setRunningCost((prev) => prev + callCost);
            }

            // Tool calls — advance progress bar with real step count
            if (event.type === "tool_call" && event.phase && event.tool_name) {
              handleToolCall(event.phase, event.tool_name);
            }

            // Tool result — done with this step, agent will think next
            if (event.type === "tool_result" && event.phase) {
              // Don't set thinking here — wait for the next "thinking" event
            }

            // Thinking indicator — agent is reasoning between tool calls
            if (event.type === "thinking" && event.phase) {
              handleThinking(event.phase);
            }

            // Phase lifecycle — mark as running with timestamp
            if (event.type === "explorer:phase") {
              const phaseId = event.phase as string;
              const sublabels: Record<string, string> = {
                manifesto: "Reading the homepage...",
                search: "Looking for search input...",
                browse: "Scanning the navigation...",
                forms: "Looking for filter controls...",
                contact: "Checking the footer...",
              };
              updatePhase(phaseId, {
                status: "running" as PhaseStatus,
                progress: 2,
                sublabel: sublabels[phaseId] || "Starting...",
                startedAt: Date.now(),
                isThinking: false,
              });
            }

            // Retry events — reset step count, show friendly sublabel
            if (event.type?.includes("-retry")) {
              const phaseId = event.type.replace("explorer:", "").replace("-retry", "");
              updatePhase(phaseId, {
                retries: event.attempt || 1,
                progress: 10,
                steps: 0,
                sublabel: "Refining results...",
                isThinking: false,
              });
            }

            // Completion — mark all phases done/failed
            if (event.type === "explorer:complete") {
              setCompletionData({
                wallTimeMs: event.wallTimeMs,
                costDisplay: event.cost_display,
              });

              updatePhase("manifesto", {
                status: event.manifestoVerified ? "done" : "failed",
                progress: 100,
                sublabel: event.manifestoVerified ? "Site identified" : "Incomplete",
                isThinking: false,
              });
              updatePhase("search", {
                status: event.searchVerified ? "done" : (event.searchStatus === "not_found" ? "done" : "failed"),
                progress: 100,
                sublabel: event.searchVerified ? "API verified" : (event.searchStatus === "not_found" ? "No search found" : "Could not verify"),
                isThinking: false,
              });
              updatePhase("browse", {
                status: event.browseVerified ? "done" : "failed",
                progress: 100,
                sublabel: event.browseVerified ? "Categories mapped" : "Could not map",
                isThinking: false,
              });
              updatePhase("forms", {
                status: event.formsVerified ? "done" : (event.formsStatus === "not_found" ? "done" : "failed"),
                progress: 100,
                sublabel: event.formsVerified ? "Filters discovered" : (event.formsStatus === "not_found" ? "No filters found" : "Could not verify"),
                isThinking: false,
              });
              updatePhase("contact", {
                status: event.contactVerified ? "done" : "failed",
                progress: 100,
                sublabel: event.contactVerified ? "Contact info found" : "Could not find",
                isThinking: false,
              });
            }

            // Explorer lifecycle events → debug log
            if (
              event.type === "explorer:started" ||
              event.type === "explorer:complete" ||
              event.type === "explorer:validated" ||
              event.type === "explorer:validation-error" ||
              event.type === "explorer:fixing" ||
              event.type === "explorer:saved" ||
              event.type === "explorer:error" ||
              event.type === "explorer:phase" ||
              event.type === "explorer:search-retry" ||
              event.type === "explorer:manifesto-retry" ||
              event.type === "explorer:browse-retry" ||
              event.type === "explorer:forms-retry" ||
              event.type === "explorer:contact-retry"
            ) {
              setLogEntries((prev) => [...prev, event as LogEntry]);
              continue;
            }

            // All other events → debug log
            if (event.side === "explorer" || !event.side) {
              const logEntry: LogEntry = {
                type: event.type,
                content: event.content,
                tool_name: event.tool_name,
                tool_input: event.tool_input,
                tool_output_preview: event.tool_output_preview,
                elapsed_ms: event.elapsed_ms,
                section: event.section,
                error: event.error,
                message: event.message,
                url: event.url,
                domain: event.domain,
                attempt: event.attempt,
                errors: event.errors,
                pagesExplored: event.pagesExplored,
                phase: event.phase,
              };
              setLogEntries((prev) => [...prev, logEntry]);
            }

            // Section-written also goes to debug log
            if (event.type === "section-written") {
              setLogEntries((prev) => [
                ...prev,
                {
                  type: "section-written",
                  section: event.section,
                  phase: event.phase,
                } as LogEntry,
              ]);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(
          `Connection error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, isRunning, onComplete]);

  // Auto-start on mount
  React.useEffect(() => {
    hasStartedRef.current = false;
    startExplorer();
    return () => {
      abortRef.current?.abort();
      hasStartedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDownload() {
    const blob = new Blob([JSON.stringify(fullDoc, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "");
      a.download = `${hostname}-agents.json`;
    } catch {
      a.download = "agents.json";
    }
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const activePhaseNames = phases.filter(p => p.status === "running").map(p => p.label);

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        {isRunning && (
          <Loader2 className="h-5 w-5 animate-spin text-brand shrink-0" />
        )}
        <div>
          <div className="text-sm font-semibold text-white">
            {isRunning
              ? `Exploring ${url}...`
              : isComplete
                ? "Exploration complete"
                : "Agent Explorer"}
          </div>
          {(isRunning || isComplete) && (
            <div className="text-xs text-neutral-500">
              <span className="text-amber-400 font-mono">${runningCost.toFixed(4)}</span>
              {" "}&middot; {docSections.length} sections written
              {IS_DEV_MODE && (
                <span className="text-neutral-600"> &middot; {(liveTokens.input + liveTokens.output).toLocaleString()} tokens</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/5 rounded-xl border border-red-500/20 p-4 mb-4 flex items-center gap-3">
          <XCircle className="h-5 w-5 text-red-500 shrink-0" />
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}


      {/* Two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Progress / Debug tabs */}
        <div className="bg-surface rounded-xl border border-[#444444] shadow-lg shadow-black/30 overflow-hidden h-[600px]">
          <div className="flex items-center border-b border-[#444444]">
            <button
              onClick={() => setLeftTab("progress")}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold uppercase tracking-wide transition-colors ${
                leftTab === "progress"
                  ? "text-brand border-b-2 border-brand -mb-px"
                  : "text-neutral-600 hover:text-neutral-400"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Progress
            </button>
            {IS_DEV_MODE && (
              <button
                onClick={() => setLeftTab("debug")}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold uppercase tracking-wide transition-colors ${
                  leftTab === "debug"
                    ? "text-brand border-b-2 border-brand -mb-px"
                    : "text-neutral-600 hover:text-neutral-400"
                }`}
              >
                <Bug className="w-3.5 h-3.5" />
                Debug
              </button>
            )}
            <span className="ml-auto pr-3 text-[10px] text-neutral-600">
              {IS_DEV_MODE && leftTab === "debug" ? `${logEntries.length} events` : ""}
            </span>
          </div>

          {leftTab === "progress" ? (
            <PhaseProgressPanel
              phases={phases}
              isComplete={isComplete}
              wallTimeMs={completionData.wallTimeMs}
              costDisplay={completionData.costDisplay}
              runningCost={runningCost}
            />
          ) : (
            <AgentLogPanel entries={logEntries} />
          )}
        </div>

        {/* Right: API Document */}
        <div className="bg-surface rounded-xl border border-[#444444] shadow-lg shadow-black/30 overflow-hidden h-[600px]">
          <AgentDocPanel
            sections={docSections}
            fullDoc={fullDoc}
            isComplete={isComplete}
            onDownload={handleDownload}
          />
        </div>
      </div>
    </div>
  );
}

/** Set a value at a dot-path on an object */
function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
) {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (
      !current[parts[i]] ||
      typeof current[parts[i]] !== "object" ||
      Array.isArray(current[parts[i]])
    ) {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}
