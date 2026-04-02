"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  Send,
  ChevronDown,
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AgentPanel, { type PanelEvent } from "@/components/ui/agent-panel";
import { IS_DEV_MODE } from "@/lib/dev-mode";

type Props = {
  domain: string;
  /** AI-generated questions tailored to the agents.json — overrides hardcoded ones */
  suggestedQuestions?: string[];
};

function getSessionId(domain: string): string {
  const key = `agentdemo_session_${domain}`;
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(key, id);
  }
  return id;
}

function getSuggestedQuestions(domain: string): string[] {
  return [
    `What does ${domain} offer?`,
    `How do I contact ${domain}?`,
    "What categories or sections are on the site?",
    "What's their return or refund policy?",
  ];
}

type ModelInfo = {
  id: string;
  provider: string;
  name: string;
  tier: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
};

export default function AgentDemo({ domain, suggestedQuestions: externalQuestions }: Props) {
  const [question, setQuestion] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [leftEvents, setLeftEvents] = useState<PanelEvent[]>([]);
  const [rightEvents, setRightEvents] = useState<PanelEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [allModels, setAllModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState("");

  // Fetch available models (dev mode only)
  useEffect(() => {
    if (!IS_DEV_MODE) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
    fetch(`${apiUrl}/api/agent/models`)
      .then((r) => r.json())
      .then((data: { models: ModelInfo[]; defaults: Record<string, string> }) => {
        setAllModels(data.models);
      })
      .catch(() => {});
  }, []);

  const suggestedQuestions = externalQuestions && externalQuestions.length > 0
    ? externalQuestions.slice(0, 4)
    : getSuggestedQuestions(domain);

  const runDemo = useCallback(
    async (q: string) => {
      if (!q.trim() || isRunning) return;

      setError(null);
      setLeftEvents([]);
      setRightEvents([]);
      setIsRunning(true);

      const sessionId = getSessionId(domain);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
        const resp = await fetch(`${apiUrl}/api/agent/demo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domain,
            question: q.trim(),
            session_id: sessionId,
            ...(selectedModel ? { model: selectedModel } : {}),
            ...(IS_DEV_MODE ? { capture: true } : {}),
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          setError(data.error || `Request failed (${resp.status})`);
          setIsRunning(false);
          return;
        }

        // Read the SSE stream
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

          // Process complete SSE lines
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6).trim();
            if (!json) continue;

            try {
              const event = JSON.parse(json);

              if (event.type === "stream:end") {
                setIsRunning(false);
                return;
              }

              const panelEvent: PanelEvent = {
                type: event.type,
                content: event.content,
                tool_name: event.tool_name,
                tool_input: event.tool_input,
                tool_output_preview: event.tool_output_preview,
                elapsed_ms: event.elapsed_ms,
              };

              if (event.side === "left") {
                setLeftEvents((prev) => [...prev, panelEvent]);
              } else if (event.side === "right") {
                setRightEvents((prev) => [...prev, panelEvent]);
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(
            `Connection error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } finally {
        setIsRunning(false);
        abortRef.current = null;
      }
    },
    [domain, isRunning],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runDemo(question);
    setQuestion("");
  };

  const handleSuggestion = (q: string) => {
    setQuestion(q);
    runDemo(q);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-[#0c0f16] to-[#0e1018] fade-in stagger-4">
      <div className="absolute inset-0 grid-pattern opacity-20 pointer-events-none" />

      <div className="relative p-6 sm:p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-6 h-6 text-brand" />
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
            Don&apos;t take our word for it
          </h3>
          <p className="text-neutral-400 max-w-xl mx-auto text-sm leading-relaxed">
            Two identical AI agents. One has <span className="text-brand font-medium">agents.json</span>, the other doesn&apos;t. Ask a question and see which one actually delivers.
          </p>
        </div>

        {/* Question input */}
        <form onSubmit={handleSubmit} className="mb-4">
          <div className="flex gap-2 max-w-2xl mx-auto">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask anything about this site..."
              disabled={isRunning}
              className="flex-1 h-11 px-4 bg-[#0a0c12] border border-[white/[0.1]] rounded-xl text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand/30 disabled:opacity-50 transition-all"
            />
            <Button
              type="submit"
              disabled={isRunning || !question.trim()}
              className="h-11 px-5 bg-brand text-white hover:bg-brand-light rounded-xl font-semibold shadow-lg shadow-brand/20 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>

          {/* Model selector — dev only */}
          {IS_DEV_MODE && allModels.length > 0 && (
            <div className="flex items-center justify-center gap-1.5 mt-2">
              <Cpu className="w-3 h-3 text-neutral-600" />
              <div className="relative">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={isRunning}
                  className="appearance-none bg-[#0a0c12] border border-white/10 rounded-md px-2 py-1 pr-6 text-[10px] text-neutral-300 font-mono cursor-pointer hover:border-white/20 focus:border-brand/50 focus:outline-none transition-colors disabled:opacity-50"
                  style={{ colorScheme: "dark" }}
                >
                  <option value="" className="bg-[#0a0c12] text-neutral-200">Default (Sonnet 4.6)</option>
                  {Object.entries(
                    allModels.reduce((acc, m) => {
                      (acc[m.provider] = acc[m.provider] || []).push(m);
                      return acc;
                    }, {} as Record<string, ModelInfo[]>)
                  ).map(([provider, models]) => (
                    <optgroup key={provider} label={provider.charAt(0).toUpperCase() + provider.slice(1)} className="bg-[#0a0c12] text-neutral-300">
                      {models.map((m) => (
                        <option key={m.id} value={m.id} className="bg-[#0a0c12] text-neutral-200">
                          {m.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-neutral-600 pointer-events-none" />
              </div>
            </div>
          )}
        </form>

        {/* Suggested questions */}
        {!isRunning &&
          leftEvents.length === 0 && (
            <div className="flex flex-wrap justify-center gap-2 mb-6 max-w-2xl mx-auto">
              {suggestedQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSuggestion(q)}
                  className="px-3 py-1.5 rounded-lg bg-[white/[0.04]] border border-[white/[0.06]] text-xs text-neutral-400 hover:text-white hover:border-brand/30 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

        {error && (
          <p className="text-center text-sm text-red-400/80 mb-4">{error}</p>
        )}

        {/* Side-by-side panels */}
        {(isRunning || leftEvents.length > 0 || rightEvents.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
            <AgentPanel side="left" events={leftEvents} isRunning={isRunning} />
            <AgentPanel
              side="right"
              events={rightEvents}
              isRunning={isRunning}
            />
          </div>
        )}
      </div>
    </div>
  );
}
