"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock,
  Code2,
  Download,
  Globe,
  Loader2,
  Palette,
  XCircle,
  Zap,
} from "lucide-react";
import AgentDemo from "@/components/ui/agent-demo";

// ======================== TYPES ========================

type AgentsJsonData = {
  version: string;
  generated_at: string;
  generator: string;
  site: {
    name: string;
    domain: string;
    language: string;
    type: string;
    description: string;
  };
  instructions: Record<string, unknown>;
  presentation: {
    rules: string[];
    currency?: string;
    language_note?: string;
    voice?: string;
    product_display?: { card_template: string; image_source: string; key_fields: string[] };
    response_style?: { greeting?: string; found_results: string; no_results: string; partial_results?: string };
  };
  pages: {
    key_pages: Array<{ url: string; description: string }>;
    total_explored: number;
    page_types: Record<string, string>;
  };
  capabilities: Record<string, { status: string; details?: string; endpoint?: { url: string; method: string; params?: string[] }; priority?: string }>;
};

// ======================== HELPERS ========================

function Chip({ children, variant = "default" }: {
  children: React.ReactNode;
  variant?: "default" | "success" | "warn" | "brand" | "muted";
}) {
  const styles = {
    default: "bg-white/[0.04] text-zinc-400 border-white/[0.1]",
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    warn: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    brand: "bg-brand/10 text-brand-light border-brand/20",
    muted: "bg-white/[0.03] text-zinc-500 border-white/[0.06]",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${styles[variant]}`}>
      {children}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-white mb-3">{children}</h3>;
}

const CAP_LABELS: Record<string, { label: string; desc: string }> = {
  navigation: { label: "Navigation", desc: "Site navigation and menu structure" },
  search: { label: "Search", desc: "Search API discovery and verification" },
  forms: { label: "Filters & Sorting", desc: "Product filters and sort parameters" },
  content_pages: { label: "Content Pages", desc: "Rich content pages with articles or info" },
};

const CAP_STATUS_COLORS: Record<string, { dot: string; text: string }> = {
  verified: { dot: "bg-emerald-500", text: "text-emerald-400" },
  found: { dot: "bg-blue-500", text: "text-blue-400" },
  not_found: { dot: "bg-neutral-600", text: "text-neutral-500" },
};

// ======================== COMPONENT ========================

export default function ProductResultsPage() {
  const params = useParams();
  const router = useRouter();
  const domain = params.domain as string;

  const [agentsJson, setAgentsJson] = useState<AgentsJsonData | null>(null);
  const [explorerMeta, setExplorerMeta] = useState<{ cost_usd?: number; total_tokens?: number; wall_time_ms?: number; suggested_questions?: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!domain) return;
    setLoading(true);
    setError("");

    Promise.all([
      fetch(`/api/site/${domain}/agents`).then(r => r.json()),
      fetch(`/api/site/${domain}/explorer-meta`).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([agentsData, metaData]) => {
        if (agentsData.error || !agentsData.site) {
          setError("No results found for this domain. Try exploring it first.");
          return;
        }
        setAgentsJson(agentsData);
        if (metaData) setExplorerMeta(metaData);
      })
      .catch(() => {
        setError("Failed to load results.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [domain]);

  function handleDownloadAgentsJson() {
    if (!agentsJson) return;
    const blob = new Blob([JSON.stringify(agentsJson, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${domain}-agents.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const capabilitiesFromAgentsJson = agentsJson ? Object.entries(agentsJson.capabilities) : [];
  const foundCapabilities = capabilitiesFromAgentsJson.filter(([, v]) => v.status !== "not_found");

  // ======================== RENDER ========================

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3 text-neutral-400">
          <Loader2 className="w-5 h-5 animate-spin text-brand" />
          <span>Loading results for {domain}...</span>
        </div>
      </div>
    );
  }

  if (error || !agentsJson) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <XCircle className="w-8 h-8 text-red-500" />
        <p className="text-neutral-400">{error || "No results found."}</p>
        <Button onClick={() => router.push("/app")} className="bg-brand text-white hover:bg-brand-light">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Explore a site
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* Domain badge in a sub-bar */}
      <div className="border-b border-white/[0.06] bg-[#0e1018]">
        <div className="max-w-[1200px] mx-auto px-6 h-10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-neutral-300 font-mono text-xs">{domain}</span>
          </div>
          <Button
            onClick={() => router.push("/app")}
            variant="outline"
            className="h-7 px-3 border-white/[0.1] text-neutral-400 hover:text-white hover:bg-white/[0.06] bg-transparent text-xs"
          >
            <ArrowLeft className="w-3 h-3 mr-1.5" />
            New exploration
          </Button>
        </div>
      </div>

      {/* ═══════════════════ RESULTS CONTENT ═══════════════════ */}
      <div className="flex-1">
        <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-8">

          {/* ── Success Header ── */}
          <div className="relative overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-brand/5 via-surface to-surface p-8 slide-up">
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-brand" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">Site documentation ready</h1>
                  <p className="text-sm text-neutral-400">{agentsJson.site.name || domain} — {agentsJson.site.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6 mt-6">
                <div className="text-center">
                  <div className="text-4xl font-bold text-white tracking-tight">{foundCapabilities.length}</div>
                  <div className="text-xs text-neutral-500 mt-1 uppercase tracking-wider">Capabilities found</div>
                </div>
                <div className="text-center border-x border-white/[0.08]">
                  <div className="text-4xl font-bold text-white tracking-tight">{agentsJson.pages.total_explored}</div>
                  <div className="text-xs text-neutral-500 mt-1 uppercase tracking-wider">Pages explored</div>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-white tracking-tight">{agentsJson.site.language.toUpperCase()}</div>
                  <div className="text-xs text-neutral-500 mt-1 uppercase tracking-wider">Language</div>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-3 mt-6 pt-5 border-t border-white/[0.08]">
                <Chip variant="brand"><Bot className="w-3 h-3" /> AI-explored</Chip>
                <Chip variant="success"><CheckCircle2 className="w-3 h-3" /> agents.json ready</Chip>
                <Chip variant="muted"><Globe className="w-3 h-3" /> {agentsJson.site.type}</Chip>
                <Chip variant="muted"><Clock className="w-3 h-3" /> {new Date(agentsJson.generated_at).toLocaleDateString()}</Chip>
              </div>

              {explorerMeta && (
                <div className="text-center mt-4 text-xs text-neutral-600">
                  {explorerMeta.wall_time_ms ? `Explored in ${(explorerMeta.wall_time_ms / 1000).toFixed(1)}s` : ""}
                  {explorerMeta.cost_usd != null ? ` · $${explorerMeta.cost_usd.toFixed(2)}` : ""}
                  {explorerMeta.total_tokens ? ` · ${explorerMeta.total_tokens.toLocaleString()} tokens` : ""}
                </div>
              )}
            </div>
          </div>

          {/* ── Agent Demo ── */}
          <AgentDemo domain={domain} suggestedQuestions={explorerMeta?.suggested_questions} />

          {/* ── Capabilities ── */}
          <div className="fade-in stagger-1">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-brand" />
              <h2 className="text-lg font-semibold text-white">Site capabilities</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {capabilitiesFromAgentsJson.map(([key, cap]) => {
                const info = CAP_LABELS[key] || { label: key, desc: "" };
                const colors = CAP_STATUS_COLORS[cap.status] || CAP_STATUS_COLORS.not_found;
                const isPower = cap.priority === "power";
                return (
                  <div key={key} className={`bg-surface rounded-xl border p-4 transition-colors ${
                    cap.status === "not_found"
                      ? "border-white/[0.08] opacity-50"
                      : isPower
                        ? "border-amber-500/30 hover:border-amber-500/40"
                        : "border-white/[0.08] hover:border-brand/20"
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2 h-2 rounded-full ${isPower ? "bg-amber-500" : colors.dot}`} />
                      <span className="text-sm font-medium text-white">{info.label}</span>
                      <div className="ml-auto flex items-center gap-1.5">
                        {isPower && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                            <Zap className="w-3 h-3" /> power
                          </span>
                        )}
                        <span className={`text-[10px] uppercase ${colors.text}`}>{cap.status.replace("_", " ")}</span>
                      </div>
                    </div>
                    {cap.details && <p className="text-xs text-neutral-500 mb-2">{cap.details}</p>}
                    {cap.endpoint && (
                      <div className="text-[11px] text-neutral-600 bg-white/[0.04] px-2 py-1 rounded font-mono">
                        {cap.endpoint.method} {cap.endpoint.url}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Presentation / Experience ── */}
          {(agentsJson.presentation.voice || agentsJson.presentation.product_display || agentsJson.presentation.response_style) && (
            <div className="fade-in stagger-2">
              <div className="flex items-center gap-2 mb-4">
                <Palette className="w-5 h-5 text-brand" />
                <h2 className="text-lg font-semibold text-white">Experience layer</h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {agentsJson.presentation.voice && (
                  <div className="bg-surface rounded-xl border border-white/[0.08] p-4">
                    <div className="text-sm font-medium text-white mb-2">Brand voice</div>
                    <p className="text-xs text-zinc-400 leading-relaxed">{agentsJson.presentation.voice}</p>
                  </div>
                )}
                {agentsJson.presentation.product_display && (
                  <div className="bg-surface rounded-xl border border-white/[0.08] p-4">
                    <div className="text-sm font-medium text-white mb-2">Product display</div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5">Card template</p>
                    <pre className="text-xs text-zinc-400 font-mono bg-white/[0.03] rounded-lg p-2 mb-2 whitespace-pre-wrap">{agentsJson.presentation.product_display.card_template}</pre>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Image source</p>
                    <p className="text-xs text-zinc-500 leading-relaxed">{agentsJson.presentation.product_display.image_source}</p>
                  </div>
                )}
                {agentsJson.presentation.response_style && (
                  <div className="bg-surface rounded-xl border border-white/[0.08] p-4 sm:col-span-2">
                    <div className="text-sm font-medium text-white mb-2">Response style</div>
                    <div className="grid sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">When results found</p>
                        <p className="text-zinc-400 leading-relaxed">{agentsJson.presentation.response_style.found_results}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">When no results</p>
                        <p className="text-zinc-400 leading-relaxed">{agentsJson.presentation.response_style.no_results}</p>
                      </div>
                    </div>
                  </div>
                )}
                {agentsJson.presentation.rules.length > 0 && (
                  <div className="bg-surface rounded-xl border border-white/[0.08] p-4">
                    <div className="text-sm font-medium text-white mb-2">Presentation rules</div>
                    <ul className="text-xs text-zinc-500 space-y-1">
                      {agentsJson.presentation.rules.map((rule, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-brand mt-0.5">-</span>
                          <span>{rule}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Instructions ── */}
          {Object.keys(agentsJson.instructions).length > 0 && (
            <div className="fade-in stagger-2">
              <div className="flex items-center gap-2 mb-4">
                <Bot className="w-5 h-5 text-brand" />
                <h2 className="text-lg font-semibold text-white">Agent instructions</h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {Object.entries(agentsJson.instructions).map(([key, value]) => {
                  const instruction = value as Record<string, unknown>;
                  return (
                    <div key={key} className="bg-surface rounded-xl border border-white/[0.08] p-4 hover:border-brand/20 transition-colors">
                      <div className="text-sm font-medium text-white capitalize mb-2">{key.replace(/_/g, " ")}</div>
                      {instruction.how ? <p className="text-xs text-neutral-400 font-mono mb-2">{String(instruction.how)}</p> : null}
                      {instruction.language_note ? <p className="text-xs text-neutral-400 mb-2">{String(instruction.language_note)}</p> : null}
                      {Array.isArray(instruction.tips) && instruction.tips.length > 0 && (
                        <ul className="text-xs text-neutral-500 space-y-1">
                          {(instruction.tips as string[]).slice(0, 3).map((tip, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="text-brand mt-0.5">-</span>
                              <span>{tip}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Key Pages ── */}
          {agentsJson.pages.key_pages.length > 0 && (
            <div className="bg-surface rounded-xl border border-white/[0.08] shadow-lg shadow-black/20 p-6 fade-in stagger-2">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="w-4 h-4 text-brand" />
                <SectionTitle>Key pages discovered</SectionTitle>
              </div>
              <div className="space-y-2">
                {agentsJson.pages.key_pages.map((page, i) => (
                  <div key={i} className="flex items-start gap-3 bg-[#0e1018] rounded-lg px-4 py-3 border border-transparent hover:border-brand/10 transition-colors">
                    <Globe className="w-3.5 h-3.5 text-neutral-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-neutral-400 truncate">{page.url}</div>
                      <div className="text-xs text-neutral-500 mt-0.5">{page.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Download agents.json ── */}
          <div className="bg-surface rounded-xl border border-white/[0.08] shadow-lg shadow-black/20 p-6 fade-in stagger-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-brand" />
                <SectionTitle>agents.json</SectionTitle>
              </div>
              <Button
                onClick={handleDownloadAgentsJson}
                variant="outline"
                className="h-8 px-3 border-white/[0.1] text-neutral-400 hover:text-white hover:bg-white/[0.06] bg-transparent text-xs"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download
              </Button>
            </div>
            <p className="text-xs text-neutral-500 mt-2">
              Complete site documentation for AI agents. Host at <code className="text-brand">/.well-known/agents.json</code> for any AI agent to discover.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
