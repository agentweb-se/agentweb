"use client";

import React, { useEffect, useState } from "react";
import { IS_DEV_MODE } from "@/lib/dev-mode";
import {
  Fingerprint,
  Search,
  Navigation,
  SlidersHorizontal,
  Phone,
  Palette,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

export type PhaseStatus = "waiting" | "running" | "done" | "failed";

export type PhaseState = {
  id: string;
  label: string;
  sublabel: string;
  status: PhaseStatus;
  retries: number;
  /** 0-100 progress based on real tool call count */
  progress: number;
  /** Number of tool calls so far */
  steps: number;
  /** Expected tool calls (for "step N of ~M" display) */
  expectedSteps: number;
  /** Timestamp when phase started running */
  startedAt?: number;
  /** Recently written sections — flash briefly */
  lastSection?: string;
  /** Is the agent thinking (between tool calls)? */
  isThinking: boolean;
};

const PHASE_ICONS: Record<string, React.ElementType> = {
  manifesto: Fingerprint,
  search: Search,
  browse: Navigation,
  forms: SlidersHorizontal,
  contact: Phone,
  experience: Palette,
};

/** Live elapsed timer — updates every second */
function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (elapsed < 1) return null;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return (
    <span className="text-[10px] text-neutral-600 font-mono tabular-nums">
      {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}
    </span>
  );
}

function PhaseRow({ phase }: { phase: PhaseState }) {
  const Icon = PHASE_ICONS[phase.id] || Fingerprint;
  const isActive = phase.status === "running";
  const isDone = phase.status === "done";
  const isFailed = phase.status === "failed";
  const isWaiting = phase.status === "waiting";

  // Flash section milestone briefly
  const [flashSection, setFlashSection] = useState<string | null>(null);
  useEffect(() => {
    if (phase.lastSection) {
      setFlashSection(phase.lastSection);
      const timer = setTimeout(() => setFlashSection(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [phase.lastSection]);

  return (
    <div
      className={`rounded-lg border p-3 transition-all duration-300 ${
        isDone
          ? "border-emerald-500/30 bg-emerald-500/5"
          : isFailed
            ? "border-red-500/20 bg-red-500/5"
            : isActive
              ? "border-brand/30 bg-brand/5"
              : "border-white/[0.08] bg-[#0e1018] opacity-50"
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isDone
              ? "bg-emerald-500/10"
              : isFailed
                ? "bg-red-500/10"
                : isActive
                  ? "bg-brand/10"
                  : "bg-white/[0.04]"
          }`}
        >
          {isDone ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : isFailed ? (
            <XCircle className="w-4 h-4 text-red-400" />
          ) : isActive ? (
            <Loader2 className="w-4 h-4 text-brand animate-spin" />
          ) : (
            <Icon className="w-4 h-4 text-neutral-600" />
          )}
        </div>

        {/* Label + sublabel */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-medium ${
                isDone
                  ? "text-emerald-300"
                  : isFailed
                    ? "text-red-300"
                    : isActive
                      ? "text-white"
                      : "text-neutral-500"
              }`}
            >
              {phase.label}
            </span>
            {/* Step counter — dev only */}
            {IS_DEV_MODE && isActive && phase.steps > 0 && (
              <span className="text-[10px] text-neutral-600 font-mono">
                step {phase.steps}
              </span>
            )}
          </div>
          <div
            className={`text-[10px] truncate ${
              isActive ? "text-neutral-400" : "text-neutral-600"
            }`}
          >
            {isDone
              ? phase.sublabel || "Complete"
              : isFailed
                ? phase.sublabel || "Failed"
                : isActive
                  ? phase.sublabel
                  : isWaiting
                    ? "Waiting..."
                    : phase.sublabel}
          </div>
        </div>

        {/* Right side: elapsed time + progress */}
        <div className="flex items-center gap-2 shrink-0">
          {isActive && phase.startedAt && (
            <ElapsedTimer startedAt={phase.startedAt} />
          )}
          {isDone && (
            <span className="text-[10px] text-emerald-500 font-medium">✓</span>
          )}
        </div>
      </div>

      {/* Section milestone flash */}
      {flashSection && isActive && (
        <div className="mt-1.5 flex items-center gap-1.5 fade-in-fast">
          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="text-[10px] text-emerald-400/80 font-mono truncate">
            Wrote {flashSection}
          </span>
        </div>
      )}

      {/* Progress bar */}
      {(isActive || isDone || isFailed) && (
        <div className={`mt-2 h-1 rounded-full bg-white/[0.04] overflow-hidden ${isActive && phase.isThinking ? "pulse-live" : ""}`}>
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              isDone
                ? "bg-emerald-500/60"
                : isFailed
                  ? "bg-red-500/40"
                  : "bg-brand/60"
            }`}
            style={{ width: `${isDone || isFailed ? 100 : phase.progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function PhaseProgressPanel({
  phases,
  isComplete,
  wallTimeMs,
  costDisplay,
  runningCost,
}: {
  phases: PhaseState[];
  isComplete: boolean;
  wallTimeMs?: number;
  costDisplay?: string;
  /** Live accumulated cost during exploration */
  runningCost?: number;
}) {
  const doneCount = phases.filter((p) => p.status === "done").length;
  const runningCount = phases.filter((p) => p.status === "running").length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.08]">
        <div className={`w-2 h-2 rounded-full ${isComplete ? "bg-emerald-500" : "bg-brand pulse-live"}`} />
        <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wide">
          Explorer
        </span>
        {/* Live cost ticker */}
        {!isComplete && runningCost !== undefined && runningCost > 0 && (
          <span className="text-[11px] text-amber-400 font-mono tabular-nums">
            ${runningCost.toFixed(4)}
          </span>
        )}
        <span className="ml-auto text-[10px] text-neutral-600">
          {isComplete
            ? `${doneCount}/${phases.length} complete`
            : runningCount > 0
              ? `${runningCount} active · ${doneCount} done`
              : "Starting..."}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {phases.map((phase) => (
          <PhaseRow key={phase.id} phase={phase} />
        ))}

        {/* Summary when complete */}
        {isComplete && (
          <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 fade-in">
            <div className="text-xs font-medium text-emerald-400 mb-1">
              Exploration complete
            </div>
            <div className="text-[10px] text-neutral-400 space-y-0.5">
              {wallTimeMs && (
                <div>{(wallTimeMs / 1000).toFixed(1)}s total</div>
              )}
              {costDisplay && (
                <div className="text-amber-400">Cost: {costDisplay}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
