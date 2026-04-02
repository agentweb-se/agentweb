"use client";

import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "lucide-react";

export type LogEntry = {
  type: string;
  content?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_output_preview?: string;
  elapsed_ms?: number;
  section?: string;
  error?: string;
  message?: string;
  url?: string;
  domain?: string;
  attempt?: number;
  errors?: string[];
  pagesExplored?: number;
  phase?: string;
  // Cost/usage fields
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost_display?: string;
  wallTimeMs?: number;
  browserActions?: number;
  httpRequests?: number;
  searchVerified?: boolean;
  browseVerified?: boolean;
  formsVerified?: boolean;
  formsStatus?: string;
  contactVerified?: boolean;
  manifestoVerified?: boolean;
};

function formatElapsed(ms?: number): string {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function EntryLine({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);

  const t = entry.type;

  // Thinking indicator
  if (t === "thinking") {
    return (
      <div className="text-neutral-600 flex items-center gap-2">
        <span className="animate-pulse">●</span>
        <span className="text-xs">thinking...</span>
      </div>
    );
  }

  // Agent text output — the main narration
  if (t === "text" && entry.content) {
    return (
      <div className="text-neutral-300 text-xs leading-relaxed whitespace-pre-wrap">
        {entry.phase && (
          <span className="text-neutral-600 text-[10px] font-mono mr-1">[{entry.phase}]</span>
        )}
        {entry.content}
      </div>
    );
  }

  // Tool call
  if (t === "tool_call") {
    const inputStr = entry.tool_input
      ? typeof entry.tool_input === "object"
        ? JSON.stringify(entry.tool_input, null, 2)
        : String(entry.tool_input)
      : "";
    const shortInput =
      inputStr.length > 80 ? inputStr.slice(0, 80) + "..." : inputStr;

    return (
      <div>
        <div
          className="flex items-center gap-2 cursor-pointer hover:bg-white/[0.06] -mx-2 px-2 py-0.5 rounded"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="text-brand text-xs font-medium">▸</span>
          <span className="text-amber-400 text-xs font-mono">
            {entry.tool_name}
          </span>
          <span className="text-neutral-600 text-[10px] truncate max-w-[300px]">
            {shortInput}
          </span>
          {entry.elapsed_ms && (
            <span className="ml-auto text-neutral-700 text-[10px]">
              {formatElapsed(entry.elapsed_ms)}
            </span>
          )}
        </div>
        {expanded && inputStr && (
          <pre className="ml-5 mt-1 text-[10px] text-neutral-500 bg-[#0a0c12] rounded p-2 border border-white/[0.06] max-h-[200px] overflow-auto">
            {inputStr}
          </pre>
        )}
      </div>
    );
  }

  // Tool result
  if (t === "tool_result") {
    return (
      <div>
        <div
          className="flex items-center gap-2 cursor-pointer hover:bg-white/[0.06] -mx-2 px-2 py-0.5 rounded"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="text-emerald-500 text-xs">✓</span>
          <span className="text-neutral-500 text-xs font-mono">
            {entry.tool_name}
          </span>
          <span className="text-emerald-600 text-[10px]">ok</span>
        </div>
        {expanded && entry.tool_output_preview && (
          <pre className="ml-5 mt-1 text-[10px] text-neutral-500 bg-[#0a0c12] rounded p-2 border border-white/[0.06] max-h-[200px] overflow-auto">
            {entry.tool_output_preview}
          </pre>
        )}
      </div>
    );
  }

  // Section written — highlight
  if (t === "section-written") {
    return (
      <div className="flex items-center gap-2 bg-emerald-500/5 -mx-2 px-2 py-1 rounded border-l-2 border-emerald-500/40">
        <span className="text-emerald-400 text-xs">✓</span>
        <span className="text-emerald-300 text-xs font-medium">
          Wrote {entry.section}
        </span>
      </div>
    );
  }

  // Explorer phase transitions
  if (t === "explorer:phase") {
    return (
      <div className="flex items-center gap-2 bg-brand/5 -mx-2 px-2 py-1.5 rounded border-l-2 border-brand/40 mt-2">
        <span className="text-brand text-xs font-medium">
          [{entry.phase}] {entry.message || ""}
        </span>
      </div>
    );
  }

  // Retry events (search, browse, manifesto, forms, contact)
  if (t === "explorer:search-retry" || t === "explorer:manifesto-retry" || t === "explorer:browse-retry" || t === "explorer:forms-retry" || t === "explorer:contact-retry") {
    const phase = t.includes("search") ? "Search" : t.includes("browse") ? "Browse" : t.includes("forms") ? "Forms" : t.includes("contact") ? "Contact" : "Manifesto";
    return (
      <div className="text-amber-400 text-xs">
        ↻ {phase} retry attempt {entry.attempt} — assessment failed
      </div>
    );
  }

  // Explorer lifecycle events
  if (t === "explorer:started") {
    return (
      <div className="text-brand text-xs font-medium">
        Exploring {entry.url}...
      </div>
    );
  }
  if (t === "explorer:complete") {
    const wallSec = entry.wallTimeMs ? (entry.wallTimeMs / 1000).toFixed(1) : "?";
    return (
      <div className="bg-emerald-500/5 -mx-2 px-3 py-2 rounded border border-emerald-500/20 space-y-1">
        <div className="text-emerald-400 text-xs font-medium">
          ✓ Exploration complete
        </div>
        <div className="text-neutral-400 text-[10px] space-y-0.5">
          <div>{wallSec}s &middot; {entry.pagesExplored ?? 0} pages &middot; {entry.browserActions ?? 0} browser actions &middot; {entry.httpRequests ?? 0} HTTP requests</div>
          {entry.total_tokens != null && (
            <div>
              {entry.input_tokens?.toLocaleString()} input + {entry.output_tokens?.toLocaleString()} output = {entry.total_tokens.toLocaleString()} tokens
            </div>
          )}
          {entry.cost_display && (
            <div className="text-amber-400 font-medium">
              Cost: {entry.cost_display}
            </div>
          )}
          <div>
            Search: {entry.searchVerified ? "✓ verified" : "✗ not verified"} &middot;
            Browse: {entry.browseVerified ? "✓ verified" : "✗ not verified"} &middot;
            Forms: {entry.formsVerified ? "✓ verified" : entry.formsStatus === "not_found" ? "— not found" : "✗ not verified"} &middot;
            Contact: {entry.contactVerified ? "✓ found" : "✗ not found"}
          </div>
        </div>
      </div>
    );
  }
  if (t === "explorer:validated") {
    return (
      <div className="text-emerald-400 text-xs">
        ✓ Schema validation passed
      </div>
    );
  }
  if (t === "explorer:validation-error") {
    return (
      <div className="text-red-400 text-xs">
        ✗ Validation failed (attempt {entry.attempt}):{" "}
        {entry.errors?.join(", ")}
      </div>
    );
  }
  if (t === "explorer:fixing") {
    return (
      <div className="text-amber-400 text-xs">
        Fixing validation errors (attempt {entry.attempt})...
      </div>
    );
  }
  if (t === "explorer:saved") {
    return (
      <div className="text-emerald-400 text-xs font-medium">
        ✓ agents.json saved for {entry.domain}
      </div>
    );
  }
  if (t === "explorer:error" || t === "error") {
    return (
      <div className="text-red-400 text-xs">
        ✗ {entry.error || entry.content || "Unknown error"}
      </div>
    );
  }
  if (t === "done") {
    return null; // handled by explorer:complete
  }

  // Fallback
  return (
    <div className="text-neutral-600 text-[10px]">
      [{t}] {entry.content || entry.message || ""}
    </div>
  );
}

export function AgentLogPanel({ entries }: { entries: LogEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  function handleScroll() {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(atBottom);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.08]">
        <Terminal className="w-4 h-4 text-brand" />
        <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wide">
          Agent Log
        </span>
        <span className="ml-auto text-[10px] text-neutral-600">
          {entries.length} events
        </span>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 space-y-1.5 font-mono"
      >
        {entries.map((entry, i) => (
          <EntryLine key={i} entry={entry} />
        ))}
        {entries.length === 0 && (
          <div className="text-neutral-600 text-xs text-center py-8">
            Waiting for agent to start...
          </div>
        )}
      </div>
    </div>
  );
}
