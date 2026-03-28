import React from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#2B2B2B] flex flex-col font-[family-name:var(--font-cascadia-mono)]">
      <nav className="sticky top-0 z-50 bg-[#0F0F0F]/90 backdrop-blur-xl border-b border-[#1C1C1C]">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/app" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/agentweb-main-icon.svg" alt="AgentWeb" className="w-8 h-8" />
            <span className="text-base font-semibold text-white tracking-tight">
              Agent<span className="text-brand">Web</span>
            </span>
          </a>
        </div>
      </nav>

      {children}
    </div>
  );
}
