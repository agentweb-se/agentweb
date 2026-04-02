"use client";

import React from "react";
import { Github } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(to bottom, #080a0f 0%, #0c0e14 40%, #10121a 70%, #0a0c12 100%)" }}>
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-[#050507]/85 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/app" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/agentweb-main-icon.svg" alt="AgentWeb" className="w-8 h-8" />
            <span className="text-[15px] font-semibold text-zinc-100 tracking-tight">
              AgentWeb
            </span>
          </a>

          <div className="flex items-center gap-6">
            <a
              href="https://github.com/agentweb-se/agentweb"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <Github className="w-[18px] h-[18px]" />
            </a>
          </div>
        </div>
      </nav>

      {children}

      {/* Footer */}
      <footer className="mt-auto border-t border-white/[0.06] bg-[#050507]">
        <div className="max-w-[1200px] mx-auto px-6 py-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-600">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/agentweb-main-icon.svg" alt="AgentWeb" className="w-5 h-5 opacity-90" />
              <span className="text-sm font-medium text-zinc-300">AgentWeb</span>
            </div>
            <div className="flex items-center gap-5">
              <a
                href="https://github.com/agentweb-se/agentweb"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-zinc-300 transition-colors"
              >
                <Github className="w-3.5 h-3.5" /> Open source
              </a>
              <a href="mailto:info@agentweb.se" className="hover:text-zinc-300 transition-colors">
                info@agentweb.se
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
