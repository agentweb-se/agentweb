"use client";

import React, { useEffect, useState } from "react";
import { Settings2, ChevronDown, Cpu } from "lucide-react";

type ModelInfo = {
  id: string;
  provider: "anthropic" | "openai" | "gemini";
  name: string;
  tier: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
};

type ModelsResponse = {
  models: ModelInfo[];
  defaults: Record<string, string>;
};

const PHASE_LABELS: Record<string, string> = {
  manifesto: "Site Identity",
  search: "Search API",
  browse: "Navigation",
  forms: "Filters & Sorting",
  contact: "Contact Info",
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "text-amber-400",
  openai: "text-emerald-400",
  gemini: "text-blue-400",
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Gemini",
};

function ModelSelect({
  phase,
  models,
  value,
  onChange,
}: {
  phase: string;
  models: ModelInfo[];
  value: string;
  onChange: (modelId: string) => void;
}) {
  const selected = models.find((m) => m.id === value);

  // Group by provider
  const grouped = models.reduce(
    (acc, m) => {
      (acc[m.provider] = acc[m.provider] || []).push(m);
      return acc;
    },
    {} as Record<string, ModelInfo[]>
  );

  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-neutral-400 w-28 shrink-0">
        {PHASE_LABELS[phase] || phase}
      </span>
      <div className="relative flex-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-[#383838] border border-[#505050] rounded-md px-3 py-1.5 text-[11px] text-neutral-200 font-mono cursor-pointer hover:border-[#5A5A5A] focus:border-brand/50 focus:outline-none transition-colors"
        >
          {Object.entries(grouped).map(([provider, providerModels]) => (
            <optgroup key={provider} label={PROVIDER_LABELS[provider] || provider}>
              {providerModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — ${m.inputCostPer1M}/${m.outputCostPer1M} per 1M
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600 pointer-events-none" />
      </div>
      {selected && (
        <span className={`text-[10px] font-mono ${PROVIDER_COLORS[selected.provider] || "text-neutral-500"}`}>
          {selected.tier}
        </span>
      )}
    </div>
  );
}

export function ModelConfigPanel({
  onModelsChange,
}: {
  onModelsChange: (models: Record<string, string>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [allModels, setAllModels] = useState<ModelInfo[]>([]);
  const [phaseModels, setPhaseModels] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
    fetch(`${apiUrl}/api/agent/models`)
      .then((r) => r.json())
      .then((data: ModelsResponse) => {
        setAllModels(data.models);
        setPhaseModels(data.defaults);
        onModelsChange(data.defaults);
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleModelChange(phase: string, modelId: string) {
    const next = { ...phaseModels, [phase]: modelId };
    setPhaseModels(next);
    onModelsChange(next);
  }

  if (!loaded || allModels.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-[#444444] bg-[#2D2D2D] overflow-hidden fade-in">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        <Settings2 className="w-3.5 h-3.5" />
        <span className="font-medium">Model Config</span>
        <Cpu className="w-3 h-3 ml-1 text-neutral-600" />
        <span className="text-[10px] text-neutral-600 font-mono">
          {Object.values(phaseModels).filter((v, i, a) => a.indexOf(v) === i).length} model{Object.values(phaseModels).filter((v, i, a) => a.indexOf(v) === i).length !== 1 ? "s" : ""}
        </span>
        <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-[#3F3F3F] pt-2">
          {Object.keys(PHASE_LABELS).map((phase) => (
            <ModelSelect
              key={phase}
              phase={phase}
              models={allModels}
              value={phaseModels[phase] || ""}
              onChange={(id) => handleModelChange(phase, id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
