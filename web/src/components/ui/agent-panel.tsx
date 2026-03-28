"use client";

import React, { useEffect, useRef } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { MarkdownText } from "@/components/ui/markdown-text";

export type PanelEvent = {
  type: "thinking" | "tool_call" | "tool_result" | "text" | "error" | "done";
  content?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_output_preview?: string;
  elapsed_ms?: number;
};

type Props = {
  side: "left" | "right";
  events: PanelEvent[];
  isRunning: boolean;
  /** Remove min/max height constraints for embedded use */
  compact?: boolean;
  /** Hide the colored header bar (used when DemoPlayer provides its own labels) */
  hideHeader?: boolean;
};

function ToolCallBlock({
  event,
  result,
}: {
  event: PanelEvent;
  result?: PanelEvent;
}) {
  const [expanded, setExpanded] = React.useState(false);

  const preview = result?.tool_output_preview || "";
  const statusMatch = preview.match(/^HTTP (\d{3})|^Status: (\d{3})/);
  const code = statusMatch ? (statusMatch[1] || statusMatch[2]) : null;
  const isError = preview.startsWith("HTTP 4") || preview.startsWith("HTTP 5") || preview.startsWith("Error:");

  return (
    <div className="my-1 group/tool">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] font-mono w-full text-left py-0.5"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-neutral-600 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-neutral-600 shrink-0" />
        )}
        <span className="text-brand/80 font-medium">{event.tool_name}</span>
        <span className="text-neutral-600">(</span>
        <span className="text-neutral-500 truncate max-w-[180px]">
          {event.tool_input
            ? JSON.stringify(event.tool_input).slice(0, 55)
            : ""}
        </span>
        <span className="text-neutral-600">)</span>
        {result && (
          <span
            className={`ml-auto text-[10px] px-2 py-0.5 rounded font-mono shrink-0 tabular-nums font-bold border ${
              isError
                ? "bg-red-500/15 text-red-400 border-red-500/25 badge-pop-error"
                : "bg-emerald-500/15 text-emerald-400 border-emerald-500/25 badge-pop-success"
            }`}
          >
            {code || (isError ? "ERR" : "ok")}
          </span>
        )}
      </button>
      {expanded && result?.tool_output_preview && (
        <pre className="mt-1 ml-5 p-2 rounded bg-[#2B2B2B]/70 border border-[#3A3A3A] text-[10px] text-neutral-600 overflow-x-auto max-h-[120px] overflow-y-auto whitespace-pre-wrap break-all leading-relaxed">
          {result.tool_output_preview}
        </pre>
      )}
    </div>
  );
}

export default function AgentPanel({ side, events, isRunning, compact, hideHeader }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isLeft = side === "left";

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  // Group tool_call with its subsequent tool_result
  const renderEvents = () => {
    const elements: React.ReactNode[] = [];
    const consumed = new Set<number>();
    let i = 0;

    while (i < events.length) {
      if (consumed.has(i)) { i++; continue; }
      const ev = events[i];

      if (ev.type === "tool_call") {
        // Look ahead for a matching tool_result (skip thinking/text in between)
        let resultIdx = -1;
        for (let j = i + 1; j < events.length; j++) {
          if (consumed.has(j)) continue;
          if (events[j].type === "tool_result") { resultIdx = j; break; }
          if (events[j].type === "tool_call") break;
        }
        const result = resultIdx !== -1 ? events[resultIdx] : undefined;
        elements.push(
          <ToolCallBlock key={i} event={ev} result={result} />,
        );
        if (resultIdx !== -1) consumed.add(resultIdx);
      } else if (ev.type === "tool_result") {
        // Orphan result
        elements.push(
          <div key={i} className="text-[10px] text-neutral-600 ml-5 my-0.5">
            {ev.tool_output_preview?.slice(0, 100)}
          </div>,
        );
      } else if (ev.type === "text") {
        elements.push(
          <MarkdownText key={i} content={ev.content || ""} className="my-1.5" />,
        );
      } else if (ev.type === "error") {
        elements.push(
          <p key={i} className="text-sm text-red-400/80 my-1.5">
            {ev.content}
          </p>,
        );
      } else if (ev.type === "thinking" && i === events.length - 1 && isRunning) {
        elements.push(
          <div key={i} className="flex items-center gap-1.5 my-2">
            <span className="w-1 h-1 rounded-full bg-neutral-600 animate-pulse" />
            <span className="w-1 h-1 rounded-full bg-neutral-600 animate-pulse [animation-delay:150ms]" />
            <span className="w-1 h-1 rounded-full bg-neutral-600 animate-pulse [animation-delay:300ms]" />
          </div>,
        );
      }

      i++;
    }

    return elements;
  };

  const isDone = events.some((e) => e.type === "done");
  const lastElapsed = events.filter((e) => e.elapsed_ms).pop()?.elapsed_ms;

  return (
    <div
      className={`flex flex-col overflow-hidden h-full ${
        compact ? (hideHeader ? "bg-[#0F0F0F]" : "bg-[#2B2B2B]") : "rounded-xl border border-[#444444] bg-[#2B2B2B]"
      }`}
    >
      {/* Header — hidden when parent provides its own labels */}
      {!hideHeader && (
        <div className={`flex items-center justify-between px-4 py-2.5 border-b shrink-0 ${
          isLeft
            ? "bg-gradient-to-r from-red-500/10 to-red-500/5 border-red-500/15"
            : "bg-gradient-to-r from-emerald-500/5 to-emerald-500/10 border-emerald-500/15"
        }`}>
          <div className="flex items-center gap-2.5">
            {isLeft ? (
              <AlertTriangle className="w-4 h-4 text-red-400/70 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400/70 shrink-0" />
            )}
            <div className="flex flex-col min-w-0">
              <div className={`text-sm font-bold leading-tight tracking-tight flex items-center gap-1.5 flex-wrap ${
                isLeft ? "text-red-400" : "text-emerald-400"
              }`}>
                <span className="text-neutral-400 font-medium">Standard Agent</span>
                <span className="text-neutral-600">+</span>
                <span className="text-neutral-400 font-medium">fetch_tool</span>
                {!isLeft && (
                  <>
                    <span className="text-neutral-600">+</span>
                    <span className="text-brand font-bold">AGENTS.JSON</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isRunning && !isDone && (
              <Loader2 className="w-3.5 h-3.5 text-neutral-600 animate-spin" />
            )}
            {isDone && lastElapsed && (
              <span
                className={`text-xs tabular-nums font-mono font-semibold ${
                  isLeft ? "text-red-400/50" : "text-emerald-400/50"
                }`}
              >
                {(lastElapsed / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </div>
      )}

      {/* Event log */}
      <div
        ref={scrollRef}
        className={`flex-1 px-4 py-3 overflow-y-auto custom-scrollbar ${
          compact ? "" : "min-h-[300px] max-h-[500px]"
        }`}
      >
        {events.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] text-neutral-700 tracking-[0.15em] uppercase">
              standby
            </span>
            <span className="inline-block w-px h-3 bg-neutral-700 ml-1.5 animate-[terminalBlink_1.2s_step-end_infinite]" />
          </div>
        )}
        {renderEvents()}
      </div>
    </div>
  );
}
