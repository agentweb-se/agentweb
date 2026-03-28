"use client";

import React, { useState } from "react";
import { IS_DEV_MODE } from "@/lib/dev-mode";
import {
  FileJson,
  LayoutGrid,
  Search,
  Globe,
  Navigation,
  ShoppingBag,
  FileText,
  Download,
  Lock,
  MapPin,
  Video,
  Calendar,
  MessageSquare,
  ClipboardList,
  CheckCircle2,
  XCircle,
  Shield,
  Zap,
} from "lucide-react";

type DocSection = {
  section: string;
  data: unknown;
};

type ViewMode = "card" | "json";

const CAPABILITY_ICONS: Record<string, React.ElementType> = {
  navigation: Navigation,
  search: Search,
  forms: ClipboardList,
  content_pages: FileText,
  listings: ShoppingBag,
  downloads: Download,
  auth: Lock,
  location: MapPin,
  media_feeds: Video,
  scheduling: Calendar,
};

const ALL_CAPABILITIES = [
  "navigation",
  "search",
  "forms",
  "content_pages",
  "listings",
  "downloads",
  "auth",
  "location",
  "media_feeds",
  "scheduling",
];

function StatusBadge({ status }: { status: string }) {
  if (status === "verified") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
        <Shield className="w-3 h-3" /> verified
      </span>
    );
  }
  if (status === "found") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-brand-light bg-brand/10 px-1.5 py-0.5 rounded">
        <CheckCircle2 className="w-3 h-3" /> found
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded">
      <XCircle className="w-3 h-3" /> not found
    </span>
  );
}

function SiteCard({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="rounded-lg border border-brand/20 bg-brand/5 p-4 fade-in">
      <div className="flex items-center gap-2 mb-2">
        <Globe className="w-4 h-4 text-brand" />
        <span className="text-sm font-semibold text-white">
          {(data.name as string) || "Site Identity"}
        </span>
      </div>
      <div className="space-y-1 text-xs text-neutral-400">
        <div>
          <span className="text-neutral-600">Domain:</span>{" "}
          {data.domain as string}
        </div>
        <div>
          <span className="text-neutral-600">Language:</span>{" "}
          {data.language as string}
        </div>
        <div>
          <span className="text-neutral-600">Type:</span>{" "}
          {data.type as string}
        </div>
        {data.description ? (
          <div className="text-neutral-300 mt-2">
            {data.description as string}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "power") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
        <Zap className="w-3 h-3" /> power
      </span>
    );
  }
  if (priority === "fallback") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded">
        fallback
      </span>
    );
  }
  return null;
}

function CapabilityCard({
  name,
  data,
}: {
  name: string;
  data: Record<string, unknown>;
}) {
  const Icon = CAPABILITY_ICONS[name] || FileText;
  const status = (data.status as string) || "not_found";
  const priority = data.priority as string | undefined;
  const isPower = priority === "power";
  const details = data.details as string | undefined;
  const endpoint = data.endpoint as
    | { url: string; method: string; params?: string[] }
    | undefined;

  return (
    <div
      className={`rounded-lg border p-3 fade-in ${
        status === "not_found"
          ? "border-[#444444] bg-[#2D2D2D] opacity-60"
          : isPower
            ? "border-amber-500/30 bg-amber-500/5"
            : status === "verified"
              ? "border-emerald-500/20 bg-emerald-500/5"
              : "border-brand/20 bg-brand/5"
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`w-3.5 h-3.5 ${isPower ? "text-amber-400" : "text-neutral-400"}`} />
        <span className="text-xs font-medium text-neutral-200 capitalize">
          {name.replace(/_/g, " ")}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {priority && <PriorityBadge priority={priority} />}
          <StatusBadge status={status} />
        </div>
      </div>
      {details && (
        <div className="text-[11px] text-neutral-400 leading-relaxed">
          {details}
        </div>
      )}
      {endpoint && (
        <div className="mt-2 text-[10px] font-mono text-emerald-400 bg-[#2B2B2B] rounded px-2 py-1 border border-[#3F3F3F]">
          {endpoint.method} {endpoint.url}
          {endpoint.params && ` ?${endpoint.params.join("&")}`}
        </div>
      )}
    </div>
  );
}

function InstructionCard({
  name,
  data,
}: {
  name: string;
  data: Record<string, unknown>;
}) {
  return (
    <div className="rounded-lg border border-[#444444] bg-[#2D2D2D] p-3 fade-in">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="w-3.5 h-3.5 text-brand" />
        <span className="text-xs font-medium text-neutral-200 capitalize">
          {name.replace(/_/g, " ")}
        </span>
      </div>
      {data.how ? (
        <div className="text-[11px] font-mono text-brand-light bg-[#2B2B2B] rounded px-2 py-1 border border-[#3F3F3F] mb-2">
          {data.how as string}
        </div>
      ) : null}
      {data.language_note ? (
        <div className="text-[11px] text-neutral-300 mb-1">
          {data.language_note as string}
        </div>
      ) : null}
      {Array.isArray(data.tips) && (data.tips as string[]).length > 0 ? (
          <ul className="text-[11px] text-neutral-400 space-y-0.5 ml-3 list-disc">
            {(data.tips as string[]).map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        ) : null}
      {Array.isArray(data.categories) && (
        <div className="mt-2 space-y-1">
          {(
            data.categories as { name: string; url: string; contains: string }[]
          ).map((cat, i) => (
            <div
              key={i}
              className="text-[10px] flex gap-2 text-neutral-500"
            >
              <span className="text-neutral-300 font-medium">{cat.name}</span>
              <span className="text-neutral-600">{cat.url}</span>
              <span>{cat.contains}</span>
            </div>
          ))}
        </div>
      )}
      {Array.isArray(data.methods) && (
        <ul className="text-[11px] text-neutral-400 space-y-0.5 ml-3 list-disc mt-1">
          {(data.methods as string[]).map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PresentationCard({ data }: { data: Record<string, unknown> }) {
  const rules = (data.rules as string[]) || [];
  return (
    <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 fade-in">
      <div className="flex items-center gap-2 mb-2">
        <ClipboardList className="w-3.5 h-3.5 text-violet-400" />
        <span className="text-xs font-medium text-neutral-200">
          Presentation Rules
        </span>
      </div>
      {data.currency ? (
        <div className="text-[11px] text-neutral-400 mb-1">
          Currency: <span className="text-violet-300">{data.currency as string}</span>
        </div>
      ) : null}
      {data.language_note ? (
        <div className="text-[11px] text-neutral-300 mb-2">
          {data.language_note as string}
        </div>
      ) : null}
      {rules.length > 0 && (
        <ul className="text-[11px] text-neutral-400 space-y-0.5 ml-3 list-disc">
          {rules.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PagesCard({ data }: { data: Record<string, unknown> }) {
  const keyPages = (data.key_pages as { url: string; description: string }[]) || [];
  const pageTypes = (data.page_types as Record<string, string>) || {};
  return (
    <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 fade-in">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-3.5 h-3.5 text-sky-400" />
        <span className="text-xs font-medium text-neutral-200">Pages</span>
        <span className="ml-auto text-[10px] text-neutral-600">
          {data.total_explored as number} explored
        </span>
      </div>
      {keyPages.length > 0 && (
        <div className="space-y-1 mb-2">
          {keyPages.map((p, i) => (
            <div key={i} className="text-[10px] flex gap-2">
              <span className="text-sky-400 font-mono shrink-0">{p.url}</span>
              <span className="text-neutral-500">{p.description}</span>
            </div>
          ))}
        </div>
      )}
      {Object.keys(pageTypes).length > 0 && (
        <div className="space-y-0.5">
          {Object.entries(pageTypes).map(([type, desc]) => (
            <div key={type} className="text-[10px] text-neutral-500">
              <span className="text-neutral-300 font-medium">{type}:</span> {desc}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CardView({
  sections,
  writtenCapabilities,
}: {
  sections: DocSection[];
  writtenCapabilities: Set<string>;
}) {
  // Extract sections by path
  const site = sections.find((s) => s.section === "site");
  const presentation = sections.find((s) => s.section === "presentation");
  const pages = sections.find((s) => s.section === "pages");

  const instructions = sections.filter((s) =>
    s.section.startsWith("instructions.")
  );
  const capabilities = sections.filter((s) =>
    s.section.startsWith("capabilities.")
  );

  return (
    <div className="space-y-3">
      {/* Site identity */}
      {site && <SiteCard data={site.data as Record<string, unknown>} />}

      {/* Instructions */}
      {instructions.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-medium text-neutral-600 uppercase tracking-wide px-1">
            Instructions
          </div>
          {instructions.map((s) => s.data ? (
            <InstructionCard
              key={s.section}
              name={s.section.replace("instructions.", "")}
              data={s.data as Record<string, unknown>}
            />
          ) : null)}
        </div>
      )}

      {/* Presentation */}
      {presentation && (
        <PresentationCard
          data={presentation.data as Record<string, unknown>}
        />
      )}

      {/* Pages */}
      {pages && <PagesCard data={pages.data as Record<string, unknown>} />}

      {/* Capabilities */}
      <div className="space-y-2">
        <div className="text-[10px] font-medium text-neutral-600 uppercase tracking-wide px-1">
          Capabilities
        </div>
        <div className="grid grid-cols-1 gap-2">
          {capabilities.map((s) => (
            <CapabilityCard
              key={s.section}
              name={s.section.replace("capabilities.", "")}
              data={s.data as Record<string, unknown>}
            />
          ))}
          {/* Pending capabilities */}
          {ALL_CAPABILITIES.filter(
            (c) => !writtenCapabilities.has(c)
          ).map((c) => (
            <div
              key={c}
              className="rounded-lg border border-[#3F3F3F] bg-[#2C2C2C] p-3 opacity-30"
            >
              <div className="flex items-center gap-2">
                {React.createElement(CAPABILITY_ICONS[c] || FileText, {
                  className: "w-3.5 h-3.5 text-neutral-600",
                })}
                <span className="text-xs text-neutral-600 capitalize">
                  {c.replace(/_/g, " ")}
                </span>
                <span className="ml-auto text-[10px] text-neutral-700">
                  pending
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function JsonView({ doc }: { doc: Record<string, unknown> }) {
  const json = JSON.stringify(doc, null, 2);
  return (
    <pre className="text-[11px] text-neutral-400 font-mono leading-relaxed whitespace-pre-wrap break-words">
      {json}
    </pre>
  );
}

export function AgentDocPanel({
  sections,
  fullDoc,
  isComplete,
  onDownload,
}: {
  sections: DocSection[];
  fullDoc: Record<string, unknown>;
  isComplete: boolean;
  onDownload?: () => void;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("card");

  const writtenCapabilities = new Set(
    sections
      .filter((s) => s.section.startsWith("capabilities."))
      .map((s) => s.section.replace("capabilities.", ""))
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#444444]">
        <FileJson className="w-4 h-4 text-emerald-400" />
        <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wide">
          API Document
        </span>
        <div className="ml-auto flex items-center gap-2">
          {/* View mode toggle — JSON tab dev only */}
          <div className="flex rounded-md border border-[#505050] overflow-hidden">
            <button
              onClick={() => setViewMode("card")}
              className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                viewMode === "card"
                  ? "bg-[#3F3F3F] text-neutral-200"
                  : "text-neutral-600 hover:text-neutral-400"
              }`}
            >
              <LayoutGrid className="w-3 h-3 inline mr-1" />
              Card
            </button>
            {IS_DEV_MODE && (
              <button
                onClick={() => setViewMode("json")}
                className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                  viewMode === "json"
                    ? "bg-[#3F3F3F] text-neutral-200"
                    : "text-neutral-600 hover:text-neutral-400"
                }`}
              >
                <FileJson className="w-3 h-3 inline mr-1" />
                JSON
              </button>
            )}
          </div>
          {isComplete && onDownload && (
            <button
              onClick={onDownload}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded border border-emerald-500/20 transition-colors"
            >
              <Download className="w-3 h-3" />
              Download
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {viewMode === "card" ? (
          <CardView
            sections={sections}
            writtenCapabilities={writtenCapabilities}
          />
        ) : (
          <JsonView doc={fullDoc} />
        )}
        {sections.length === 0 && (
          <div className="text-neutral-600 text-xs text-center py-8">
            Document will build here as the agent explores...
          </div>
        )}
      </div>
    </div>
  );
}
