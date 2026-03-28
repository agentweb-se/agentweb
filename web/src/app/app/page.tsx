"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AgentExplorer } from "@/components/ui/agent-explorer";
import { ModelConfigPanel } from "@/components/ui/model-config-panel";
import { IS_DEV_MODE } from "@/lib/dev-mode";
import { trackEvent } from "@/lib/analytics";
import { Bot, Globe, Loader2, XCircle } from "lucide-react";

type Stage = "idle" | "running" | "done" | "error";

export default function AppHome() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [explorerKey, setExplorerKey] = useState(0);
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");

  const domain = useMemo(() => {
    try { return new URL(url).hostname.replace(/^www\./, ""); }
    catch { return ""; }
  }, [url]);

  // Cycling placeholder examples
  const EXAMPLE_URLS = useMemo(() => [
    "www.elgiganten.se",
    "www.clasohlson.com/se",
    "eu.gymshark.com",
    "www.mindark.com",
  ], []);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholderText, setPlaceholderText] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const placeholderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (url) return;
    const target = EXAMPLE_URLS[placeholderIdx];
    let charIdx = 0;

    if (isTyping) {
      const type = () => {
        charIdx++;
        setPlaceholderText(target.slice(0, charIdx));
        if (charIdx < target.length) {
          placeholderTimerRef.current = setTimeout(type, 60 + Math.random() * 40);
        } else {
          placeholderTimerRef.current = setTimeout(() => setIsTyping(false), 2000);
        }
      };
      placeholderTimerRef.current = setTimeout(type, 300);
    } else {
      let eraseIdx = target.length;
      const erase = () => {
        eraseIdx--;
        setPlaceholderText(target.slice(0, eraseIdx));
        if (eraseIdx > 0) {
          placeholderTimerRef.current = setTimeout(erase, 30);
        } else {
          setPlaceholderIdx((i) => (i + 1) % EXAMPLE_URLS.length);
          setIsTyping(true);
        }
      };
      placeholderTimerRef.current = setTimeout(erase, 200);
    }

    return () => { if (placeholderTimerRef.current) clearTimeout(placeholderTimerRef.current); };
  }, [url, placeholderIdx, isTyping, EXAMPLE_URLS]);

  const handleExampleClick = useCallback((exampleUrl: string) => {
    setUrl("https://" + exampleUrl);
  }, []);

  function startAgentExplorer() {
    if (!url) return;
    setStage("running");
    setError("");
    setExplorerKey((k) => k + 1);
    trackEvent("explorer_start", { domain });
  }

  function resetToIdle() {
    setUrl("");
    setStage("idle");
    setError("");
    setExplorerKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      {/* ═══════════════════ IDLE: Hero Input ═══════════════════ */}
      {stage === "idle" && (
        <section className="relative overflow-hidden">
          {/* Background grid */}
          <div className="absolute inset-0" aria-hidden="true"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
            }} />
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true"
            style={{
              background: "linear-gradient(100deg, transparent 0%, transparent 15%, rgba(255,107,0,0.03) 30%, rgba(255,255,255,0.05) 45%, rgba(255,107,0,0.04) 55%, rgba(255,255,255,0.03) 70%, transparent 85%, transparent 100%)",
              backgroundSize: "300% 100%",
              animation: "gridShimmer 40s ease-in-out infinite",
            }} />
          <div className="absolute top-1/2 left-1/2 w-[900px] h-[600px] -translate-x-1/2 -translate-y-1/2 pointer-events-none glow-pulse" aria-hidden="true"
            style={{ background: "radial-gradient(ellipse, rgba(255,107,0,0.08) 0%, transparent 70%)" }} />

          <div className="relative max-w-[1200px] mx-auto px-6 pt-24 pb-20 text-center">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6 fade-in stagger-1">
              <span className="text-white">Explore any website.</span>
              <br />
              <span className="text-gradient-brand">Build the operating manual.</span>
            </h1>

            <p className="text-lg text-neutral-400 max-w-xl mx-auto mb-12 fade-in stagger-2 leading-relaxed">
              Paste a URL below. The AI explorer will browse the site, discover every capability, and generate the agents.json operating manual.
            </p>

            {/* Hero Input Bar */}
            <div className="max-w-2xl mx-auto fade-in stagger-3">
              <div className="input-glow-wrap">
                <div className="flex gap-3 items-center bg-surface rounded-2xl p-2 shadow-2xl shadow-black/50">
                  <div className="flex-1 flex items-center gap-3 pl-4">
                    <Globe className="w-5 h-5 text-neutral-600 shrink-0" />
                    <div className="relative flex-1">
                      <input
                        type="url"
                        placeholder=" "
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && startAgentExplorer()}
                        className="w-full bg-transparent text-white text-base focus:outline-none py-3 relative z-10"
                      />
                      {!url && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 text-neutral-600 text-base pointer-events-none select-none">
                          {placeholderText}<span className="inline-block w-[2px] h-[1.1em] bg-brand/60 align-middle ml-px animate-pulse" />
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={startAgentExplorer}
                    disabled={!url}
                    className="h-12 px-8 bg-brand text-white hover:bg-brand-light font-semibold rounded-xl shadow-lg shadow-brand/20 disabled:opacity-50 transition-all text-base"
                  >
                    <Bot className="h-5 w-5 mr-2" />
                    Explore
                  </Button>
                </div>
              </div>

              {IS_DEV_MODE && (
                <div className="mt-4 max-w-xl mx-auto">
                  <ModelConfigPanel onModelsChange={setSelectedModels} />
                </div>
              )}

              {/* Example URL chips */}
              <div className="flex flex-wrap justify-center gap-2 mt-3">
                <span className="text-xs text-neutral-600 mr-1 self-center">Try:</span>
                {EXAMPLE_URLS.slice(0, 4).map((ex) => (
                  <button
                    key={ex}
                    onClick={() => handleExampleClick(ex)}
                    className="text-xs px-3 py-1.5 rounded-full border border-[#505050] text-neutral-500 hover:text-brand hover:border-brand/30 hover:bg-brand/5 transition-all"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════ COMPACT INPUT BAR (non-idle) ═══════════════════ */}
      {stage !== "idle" && (
        <div className="flex-1 flex flex-col">
          <div className="max-w-[1200px] mx-auto px-6 pt-6 w-full">
            <div className="bg-surface rounded-xl border border-[#444444] shadow-lg shadow-black/30 p-5 mb-6">
              <div className="flex gap-3 flex-wrap items-end">
                <div className="flex-1 min-w-[280px]">
                  <label className="block text-xs font-medium text-neutral-500 mb-1.5">Website URL</label>
                  <input
                    type="url"
                    placeholder="https://example.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && stage !== "running" && startAgentExplorer()}
                    disabled={stage === "running"}
                    className="w-full h-11 rounded-lg border border-[#505050] bg-[#2B2B2B] px-4 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand/40 transition-all disabled:opacity-50"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={resetToIdle}
                    variant="outline"
                    disabled={stage === "running"}
                    className="h-11 px-4 border-[#505050] text-neutral-400 hover:text-white hover:bg-[#3F3F3F] bg-transparent disabled:opacity-50"
                  >
                    New
                  </Button>
                  <Button
                    onClick={startAgentExplorer}
                    disabled={!url || stage === "running"}
                    className="h-11 px-6 bg-brand text-white hover:bg-brand-light font-medium shadow-sm shadow-brand/20 disabled:opacity-50 transition-all"
                  >
                    {stage === "running" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Bot className="h-4 w-4 mr-2" />}
                    {stage === "running" ? "Exploring..." : "Explore"}
                  </Button>
                </div>
              </div>

              {IS_DEV_MODE && stage !== "running" && (
                <ModelConfigPanel onModelsChange={setSelectedModels} />
              )}
            </div>
          </div>

          <div className="max-w-[1200px] mx-auto px-6 pb-6 w-full">
            {stage === "running" && (
              <div className="mb-6 fade-in">
                <AgentExplorer
                  key={explorerKey}
                  url={url}
                  models={selectedModels}
                  onComplete={() => {
                    setStage("done");
                    trackEvent("explorer_complete", { domain });
                    if (domain) router.push(`/app/results/${domain}`);
                  }}
                />
              </div>
            )}

            {error && (
              <div className="bg-red-500/5 rounded-xl border border-red-500/20 p-4 mb-6 fade-in flex items-center gap-3">
                <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                <span className="text-sm text-red-400">{error}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-[#3F3F3F] mt-auto">
        <div className="max-w-[1200px] mx-auto px-6 py-8">
          <div className="flex items-center justify-between text-xs text-neutral-600">
            <span>&copy; 2026 AgentWeb.io</span>
            <span>Internal product — not for public distribution</span>
          </div>
        </div>
      </footer>
    </>
  );
}
