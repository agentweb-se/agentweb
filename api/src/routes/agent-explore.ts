/**
 * POST /api/agent/explore — starts the explorer agent and streams SSE events.
 * GET  /api/site/:domain/explore-log — serve latest explorer log file.
 *
 * Same pattern as /api/agent/demo: POST + ReadableStream SSE.
 * Single agent (not side-by-side). Events stream to the two-panel frontend.
 */
import * as fs from "fs";
import * as path from "path";
import { Hono } from "hono";
import { startExplorer } from "../lib/agent-docs/explorer.js";
import { saveAgentsJson } from "../lib/agent-docs/reader.js";
import { getAllModels, getPhaseModel } from "../lib/agent/providers/models.js";

const OUTPUT_DIR = process.env.OUTPUT_DIR || "output";

const agentExplore = new Hono();

agentExplore.post("/explore", async (c) => {
  console.log("[explore] POST /api/agent/explore received");

  let body: { url?: string; models?: Record<string, string> };
  try {
    body = await c.req.json();
  } catch {
    console.log("[explore] Invalid JSON body");
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { url, models } = body;
  console.log("[explore] URL:", url, "models:", models);

  if (!url) {
    return c.json({ error: "Missing required field: url" }, 400);
  }

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    console.log("[explore] Invalid URL:", url);
    return c.json({ error: "Invalid URL" }, 400);
  }

  // Reject URLs where hostname looks wrong (e.g. https://https://...)
  if (!parsedUrl.hostname.includes(".")) {
    console.log("[explore] Invalid hostname:", parsedUrl.hostname);
    return c.json({ error: `Invalid URL: "${parsedUrl.hostname}" is not a valid domain` }, 400);
  }

  const domain = parsedUrl.hostname.replace(/^www\./, "");
  console.log("[explore] Starting explorer for domain:", domain);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Stream already closed
        }
      };

      startExplorer(url, send, models)
        .then((agentsJson) => {
          console.log(`[explore] Explorer finished for ${domain}, saving agents.json...`);
          try {
            saveAgentsJson(domain, agentsJson);
            console.log(`[explore] agents.json saved for ${domain}`);
            send({ type: "explorer:saved", domain });
          } catch (err) {
            console.error(`[explore] Failed to save agents.json for ${domain}:`, err);
            send({
              type: "explorer:save-error",
              error: err instanceof Error ? err.message : String(err),
            });
          }
        })
        .catch((err) => {
          console.error(`[explore] Explorer crashed for ${domain}:`, err);
          send({
            type: "explorer:error",
            error: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          send({ type: "stream:end" });
          try {
            controller.close();
          } catch {
            // Already closed
          }
        });
    },
  });

  const origin = c.req.header("Origin") || "*";
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
});

// Serve latest explorer log for a domain
agentExplore.get("/site/:domain/explore-log", async (c) => {
  const domain = c.req.param("domain");
  const domainDir = path.join(OUTPUT_DIR, domain);

  if (!fs.existsSync(domainDir)) {
    return c.json({ error: "No logs found for domain" }, 404);
  }

  // Find latest explorer-*.jsonl file
  const files = fs.readdirSync(domainDir)
    .filter((f) => f.startsWith("explorer-") && f.endsWith(".jsonl"))
    .sort()
    .reverse();

  if (files.length === 0) {
    return c.json({ error: "No explorer logs found" }, 404);
  }

  const latestLog = path.join(domainDir, files[0]);
  const content = fs.readFileSync(latestLog, "utf-8");

  return new Response(content, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Access-Control-Allow-Origin": c.req.header("Origin") || "*",
    },
  });
});

// GET /api/models — return available models + current defaults per phase
agentExplore.get("/models", (c) => {
  const phases = ["manifesto", "search", "browse", "forms", "contact"];
  const defaults: Record<string, string> = {};
  for (const phase of phases) {
    defaults[phase] = getPhaseModel(phase);
  }

  return c.json({
    models: getAllModels(),
    defaults,
  });
});

export default agentExplore;
