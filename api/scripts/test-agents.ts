#!/usr/bin/env npx tsx
/**
 * End-to-end test harness for the AI agent demo.
 *
 * 1. Takes a domain + question (requires agents.json from a prior explorer run)
 * 2. Runs BOTH agents (web fetcher + agents.json) against the question
 * 3. Outputs full event logs + comparison summary
 *
 * Usage:
 *   npx tsx scripts/test-agents.ts <url|domain> "<question>"
 *   npx tsx scripts/test-agents.ts elgiganten.se "Find gaming laptops"
 *   npx tsx scripts/test-agents.ts elgiganten.se "Find gaming laptops" --right-only
 *   npx tsx scripts/test-agents.ts elgiganten.se "Find gaming laptops" --left-only
 *
 * Flags:
 *   --left-only    Only run the web agent (no agents.json)
 *   --right-only   Only run the agents.json agent
 */

import fs from "fs";
import path from "path";

// Load .env.local manually
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

import { startWebAgent } from "../src/lib/agent/web-agent";
import { startAgentsJsonAgent } from "../src/lib/agent/mcp-agent";
import { readAgentsJson } from "../src/lib/agent-docs/reader";
import type { AgentDemoEvent } from "../src/lib/agent/types";

// ── Parse args ──
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const positional = args.filter((a) => !a.startsWith("--"));

const urlOrDomain = positional[0];
const question = positional[1];
const rightOnly = flags.includes("--right-only");
const leftOnly = flags.includes("--left-only");

if (!urlOrDomain || !question) {
  console.error(
    'Usage: npx tsx scripts/test-agents.ts <url|domain> "<question>" [flags]',
  );
  console.error("");
  console.error("Flags: --left-only --right-only");
  console.error("");
  console.error("Cached domains (with agents.json):");
  const outDir = path.join(process.cwd(), "output");
  if (fs.existsSync(outDir)) {
    fs.readdirSync(outDir)
      .filter((d: string) => !d.startsWith("_"))
      .filter((d: string) => fs.existsSync(path.join(outDir, d, "agents.json")))
      .forEach((d: string) => console.error(`  ${d}`));
  }
  process.exit(1);
}

// Normalize URL → domain
function toDomain(input: string): string {
  try {
    const u = new URL(input.startsWith("http") ? input : `https://${input}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return input.replace(/^www\./, "");
  }
}

function toUrl(input: string): string {
  if (input.startsWith("http")) return input;
  return `https://${input}`;
}

const domain = toDomain(urlOrDomain);
const inputUrl = toUrl(urlOrDomain);

// ── Verify agents.json exists ──
if (!leftOnly) {
  const agentsJson = readAgentsJson(domain);
  if (!agentsJson) {
    console.error(`No agents.json found for "${domain}". Run the explorer first.`);
    process.exit(1);
  }
  console.log(`\x1b[90mUsing agents.json for ${domain}\x1b[0m`);
}

// ── Run agents ──
type TimedEvent = AgentDemoEvent & { _ts: number };

function printEvent(label: string, ev: TimedEvent) {
  const tag =
    label === "LEFT" ? "\x1b[31mLEFT \x1b[0m" : "\x1b[32mRIGHT\x1b[0m";
  const time = `\x1b[90m${(ev._ts / 1000).toFixed(1).padStart(6)}s\x1b[0m`;

  switch (ev.type) {
    case "thinking":
      console.log(`${time} ${tag} \x1b[90m... thinking\x1b[0m`);
      break;
    case "tool_call":
      console.log(
        `${time} ${tag} \x1b[33mCALL\x1b[0m ${ev.tool_name}(${trunc(JSON.stringify(ev.tool_input), 80)})`,
      );
      break;
    case "tool_result": {
      const preview = ev.tool_output_preview || "";
      console.log(
        `${time} ${tag} \x1b[36mRESULT\x1b[0m ${ev.tool_name} -> ${trunc(preview, 120)}`,
      );
      break;
    }
    case "text": {
      const lines = wrap(ev.content || "", 100);
      lines.forEach((line, i) => {
        if (i === 0) console.log(`${time} ${tag} ${line}`);
        else console.log(`${"".padStart(20)}${line}`);
      });
      break;
    }
    case "error":
      console.log(`${time} ${tag} \x1b[31mERROR\x1b[0m ${ev.content}`);
      break;
    case "done":
      console.log(`${time} ${tag} \x1b[90m--- done ---\x1b[0m`);
      break;
  }
}

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

function wrap(s: string, w: number): string[] {
  if (s.length <= w) return [s];
  const out: string[] = [];
  let rem = s;
  while (rem.length > w) {
    let brk = rem.lastIndexOf(" ", w);
    if (brk <= 0) brk = w;
    out.push(rem.slice(0, brk));
    rem = rem.slice(brk).trimStart();
  }
  if (rem) out.push(rem);
  return out;
}

async function runAgents(): Promise<void> {
  const siteUrl = inputUrl;

  const leftEvents: TimedEvent[] = [];
  const rightEvents: TimedEvent[] = [];
  const startTime = Date.now();

  const collect =
    (events: TimedEvent[], label: string) => (ev: AgentDemoEvent) => {
      const te = { ...ev, _ts: Date.now() - startTime };
      events.push(te);
      printEvent(label, te);
    };

  const promises: Promise<void>[] = [];

  if (!rightOnly) {
    console.log("\x1b[31m── LEFT AGENT (Web Fetcher) ──\x1b[0m");
    promises.push(
      startWebAgent(siteUrl, domain, question, collect(leftEvents, "LEFT")).catch(
        (err) => console.error(`LEFT crashed: ${err}`),
      ),
    );
  }

  if (!leftOnly) {
    console.log("\x1b[32m── RIGHT AGENT (agents.json) ──\x1b[0m");
    promises.push(
      startAgentsJsonAgent(siteUrl, domain, question, collect(rightEvents, "RIGHT")).catch(
        (err) => console.error(`RIGHT crashed: ${err}`),
      ),
    );
  }

  await Promise.allSettled(promises);

  // ── Summary ──
  console.log("");
  console.log("=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));

  function summarize(label: string, events: TimedEvent[]) {
    const calls = events.filter((e) => e.type === "tool_call");
    const texts = events.filter((e) => e.type === "text");
    const errors = events.filter((e) => e.type === "error");
    const done = events.find((e) => e.type === "done");
    const ms = done ? done._ts : events[events.length - 1]?._ts || 0;
    const chain = calls.map((e) => e.tool_name).join(" -> ");
    const answerLen = texts.reduce(
      (a, e) => a + (e.content?.length || 0),
      0,
    );

    console.log(`\n${label}:`);
    console.log(`  Time:       ${(ms / 1000).toFixed(1)}s`);
    console.log(`  Tool calls: ${calls.length} (${chain || "none"})`);
    console.log(`  Answer len: ${answerLen} chars / ${texts.length} blocks`);
    console.log(`  Errors:     ${errors.length}`);
  }

  if (!rightOnly) summarize("\x1b[31mLEFT (Web)\x1b[0m", leftEvents);
  if (!leftOnly) summarize("\x1b[32mRIGHT (agents.json)\x1b[0m", rightEvents);

  if (!leftOnly && !rightOnly) {
    const lMs = leftEvents.find((e) => e.type === "done")?._ts || 0;
    const rMs = rightEvents.find((e) => e.type === "done")?._ts || 0;
    const lCalls = leftEvents.filter((e) => e.type === "tool_call").length;
    const rCalls = rightEvents.filter((e) => e.type === "tool_call").length;

    console.log("\n\x1b[1mCOMPARISON:\x1b[0m");
    console.log(
      `  Speed:      ${lMs < rMs ? "LEFT wins" : "RIGHT wins"} (${(lMs / 1000).toFixed(1)}s vs ${(rMs / 1000).toFixed(1)}s)`,
    );
    console.log(
      `  Efficiency: ${lCalls < rCalls ? "LEFT fewer" : rCalls < lCalls ? "RIGHT fewer" : "tied"} calls (${lCalls} vs ${rCalls})`,
    );
  }

  console.log("");
}

// ── Main ──
async function main() {
  console.log("=".repeat(80));
  console.log(`AGENT TEST`);
  console.log(`URL:        ${inputUrl}`);
  console.log(`DOMAIN:     ${domain}`);
  console.log(`QUESTION:   ${question}`);
  console.log(
    `MODE:       ${leftOnly ? "LEFT ONLY" : rightOnly ? "RIGHT ONLY" : "BOTH"}`,
  );
  console.log("=".repeat(80));
  console.log("");

  await runAgents();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
