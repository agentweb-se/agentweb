#!/usr/bin/env -S npx tsx
import fs from "fs";
import path from "path";
import crypto from "crypto";
import http from "http";
import https from "https";
import { execSync } from "child_process";

type Json = Record<string, unknown>;

type ExploreEvent = Record<string, unknown>;
type DemoEvent = {
  side?: "left" | "right";
  type: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_output_preview?: string;
  content?: string;
} & Record<string, unknown>;

type TimedDemoEvent = DemoEvent & { _ts: number };

type AgentSummary = {
  done: boolean;
  ms: number;
  toolCalls: number;
  errors: number;
  textBlocks: number;
  answerChars: number;
};

type QuestionSummary = {
  question: string;
  left: AgentSummary;
  right: AgentSummary;
  speedWinner: "left" | "right" | "tie";
  efficiencyWinner: "left" | "right" | "tie";
};

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));

const inputUrl = positional[0];
const questionArgs = positional.slice(1);
const apiUrl = getFlagValue("--api-url") || process.env.AGENTWEB_API_URL || "http://127.0.0.1:4001";
const explorerTimeoutMs = Number(getFlagValue("--explorer-timeout-ms") || "900000");
const demoTimeoutMs = Number(getFlagValue("--demo-timeout-ms") || "180000");
const repoRoot = path.resolve(process.cwd(), "..");
const outputDir = path.join(repoRoot, "tests", "output");
const shouldRestartApi = !flags.has("--no-restart-api");

if (!inputUrl) {
  console.error("Usage: cd api && npx tsx ../tests/agentweb-e2e.ts <url> [question ...] [--api-url http://127.0.0.1:4001] [--no-restart-api]");
  console.error("Example:");
  console.error("  cd api && npx tsx ../tests/agentweb-e2e.ts https://mindark.com \"What does this company do?\" \"How can I contact them?\"");
  process.exit(1);
}

const questions = questionArgs.length > 0
  ? questionArgs
  : [
      "What does this company do?",
      "How can I contact them?",
      "What sections or categories are available on the site?",
    ];

fs.mkdirSync(outputDir, { recursive: true });

function getFlagValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function toDomain(input: string): string {
  const url = new URL(input.startsWith("http") ? input : `https://${input}`);
  return url.hostname.replace(/^www\./, "");
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function randomSessionId(): string {
  return crypto.randomBytes(8).toString("hex");
}

async function collectSse(urlStr: string, body: Json, timeoutMs: number): Promise<Record<string, unknown>[]> {
  const url = new URL(urlStr);
  const client = url.protocol === "https:" ? https : http;
  const events: Record<string, unknown>[] = [];

  return await new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
        },
      },
      (res) => {
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage || ""}`.trim()));
          return;
        }

        res.setEncoding("utf8");
        let buffer = "";

        res.on("data", (chunk: string) => {
          buffer += chunk;
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            for (const line of block.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (!raw) continue;
              try {
                events.push(JSON.parse(raw));
              } catch {
                events.push({ type: "parse_error", raw });
              }
            }
          }
        });

        res.on("end", () => resolve(events));
        res.on("error", reject);
      },
    );

    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout after ${timeoutMs}ms`));
    });
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function getJson<T = Json>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function summarizeAgent(events: TimedDemoEvent[]): AgentSummary {
  const done = events.some((e) => e.type === "done");
  const end = done
    ? events.find((e) => e.type === "done")?._ts || 0
    : events[events.length - 1]?._ts || 0;
  return {
    done,
    ms: end,
    toolCalls: events.filter((e) => e.type === "tool_call").length,
    errors: events.filter((e) => e.type === "error").length,
    textBlocks: events.filter((e) => e.type === "text").length,
    answerChars: events.filter((e) => e.type === "text").reduce((sum, e) => sum + (e.content?.length || 0), 0),
  };
}

function winnerByNumber(left: number, right: number): "left" | "right" | "tie" {
  if (left === right) return "tie";
  return left < right ? "left" : "right";
}

function restartApi(): void {
  console.log("[0/4] Restarting API fresh...");

  try { execSync("docker rm -f agentweb-api-test-run", { stdio: "ignore" }); } catch {}
  try { execSync("bash -lc 'fuser -k 4001/tcp'", { stdio: "ignore" }); } catch {}

  execSync(`docker build -t agentweb-api-test -f ${path.join(repoRoot, "docker", "Dockerfile")} ${path.join(repoRoot, "api")}`, {
    stdio: "inherit",
  });

  execSync([
    "docker run -d --name agentweb-api-test-run",
    `--env-file ${path.join(repoRoot, ".env.local")}`,
    "-e PORT=4001",
    "-e OUTPUT_DIR=/app/output",
    "-p 4001:4001",
    "agentweb-api-test",
  ].join(" "), { stdio: "inherit" });
}

async function run(): Promise<void> {
  const domain = toDomain(inputUrl);
  const runId = `${domain}-${stamp()}`;

  console.log(`Run: ${runId}`);
  console.log(`API: ${apiUrl}`);
  console.log(`URL: ${inputUrl}`);
  console.log(`Questions: ${questions.length}`);
  console.log("");

  if (shouldRestartApi) restartApi();

  console.log("[1/4] Explorer run...");
  const exploreEvents = await collectSse(`${apiUrl}/api/agent/explore`, { url: inputUrl }, explorerTimeoutMs);
  const agentsJson = await getJson(`${apiUrl}/api/site/${domain}/agents`);
  const explorerMeta = await getJson(`${apiUrl}/api/site/${domain}/explorer-meta`);

  const questionSummaries: QuestionSummary[] = [];
  const questionArtifacts: Array<{ question: string; events: TimedDemoEvent[] }> = [];

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    console.log(`[${i + 2}/${questions.length + 3}] Demo run: ${question}`);
    const start = Date.now();
    const demoEvents = await collectSse(
      `${apiUrl}/api/agent/demo`,
      { domain, question, session_id: randomSessionId() },
      demoTimeoutMs,
    ) as DemoEvent[];

    const timed = demoEvents.map((e) => ({ ...e, _ts: Date.now() - start })) as TimedDemoEvent[];
    const left = summarizeAgent(timed.filter((e) => e.side === "left"));
    const right = summarizeAgent(timed.filter((e) => e.side === "right"));
    questionSummaries.push({
      question,
      left,
      right,
      speedWinner: winnerByNumber(left.ms || Number.MAX_SAFE_INTEGER, right.ms || Number.MAX_SAFE_INTEGER),
      efficiencyWinner: winnerByNumber(left.toolCalls, right.toolCalls),
    });
    questionArtifacts.push({ question, events: timed });
  }

  const summary = {
    runId,
    apiUrl,
    url: inputUrl,
    domain,
    generatedAt: new Date().toISOString(),
    explorer: {
      eventCount: exploreEvents.length,
      saved: exploreEvents.some((e) => e.type === "explorer:saved"),
      streamEnded: exploreEvents.some((e) => e.type === "stream:end"),
      meta: explorerMeta,
    },
    questions: questionSummaries,
    autoJudgement: {
      rightSpeedWins: questionSummaries.filter((q) => q.speedWinner === "right").length,
      leftSpeedWins: questionSummaries.filter((q) => q.speedWinner === "left").length,
      rightEfficiencyWins: questionSummaries.filter((q) => q.efficiencyWinner === "right").length,
      leftEfficiencyWins: questionSummaries.filter((q) => q.efficiencyWinner === "left").length,
      note: "Speed/tool-call winners are automatic. Answer quality still needs human review until a dedicated evaluator exists.",
    },
  };

  const outPath = path.join(outputDir, `${runId}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ summary, exploreEvents, agentsJson, questionArtifacts }, null, 2));

  console.log("\n[done] Harness finished");
  console.log(`Output: ${outPath}`);
  console.log(`Explorer saved: ${summary.explorer.saved ? "yes" : "no"}`);
  console.log(`Questions run: ${questionSummaries.length}`);
  console.log(`RIGHT speed wins: ${summary.autoJudgement.rightSpeedWins}`);
  console.log(`LEFT speed wins: ${summary.autoJudgement.leftSpeedWins}`);
  console.log("Note: answer quality still requires human review.");
}

run().catch((err) => {
  console.error("Harness failed:", err);
  process.exit(1);
});
