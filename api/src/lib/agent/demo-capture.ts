import fs from "fs";
import path from "path";
import type { AgentDemoEvent, StreamEndEvent } from "./types.js";

/** A single timestamped event for replay */
export interface CapturedEvent {
  /** Milliseconds since demo start */
  t: number;
  /** The full SSE event payload */
  event: AgentDemoEvent | StreamEndEvent;
}

/** Full demo capture — everything needed to replay a demo */
export interface DemoCapture {
  domain: string;
  question: string;
  model: string | null;
  captured_at: string;
  duration_ms: number;
  event_count: number;
  events: CapturedEvent[];
}

// --- Dependency injection ---

export type DemoCaptureDependencies = {
  mkdirSync: (dirPath: string, options: { recursive: boolean }) => void;
  writeFileSync: (filePath: string, data: string, encoding: BufferEncoding) => void;
  outputDir: string;
  now: () => number;
};

function resolveDemoCaptureDeps(overrides?: Partial<DemoCaptureDependencies>): DemoCaptureDependencies {
  return {
    mkdirSync: overrides?.mkdirSync ?? ((p, o) => fs.mkdirSync(p, o)),
    writeFileSync: overrides?.writeFileSync ?? fs.writeFileSync,
    outputDir: overrides?.outputDir ?? (process.env.OUTPUT_DIR || path.resolve(process.cwd(), "..", "output")),
    now: overrides?.now ?? Date.now,
  };
}

// --- Public API ---

/**
 * Save a demo capture to output/{domain}/demo-captures/{timestamp}.json
 * Each capture gets its own file so multiple demos per domain don't overwrite.
 */
export function saveDemoCapture(
  capture: DemoCapture,
  deps?: Partial<DemoCaptureDependencies>,
): void {
  const d = resolveDemoCaptureDeps(deps);
  const domainDir = path.join(d.outputDir, capture.domain, "demo-captures");

  d.mkdirSync(domainDir, { recursive: true });

  const slug = capture.question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  const ts = new Date(d.now()).toISOString().replace(/[:.]/g, "-");
  const filename = `${slug}_${ts}.json`;
  const filepath = path.join(domainDir, filename);

  d.writeFileSync(filepath, JSON.stringify(capture, null, 2), "utf-8");
  console.log(`[demo-capture] Saved ${capture.event_count} events to ${filepath}`);
}
