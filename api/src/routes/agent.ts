import { Hono } from "hono";
import { readAgentsJson } from "../lib/agent-docs/reader.js";
import { startWebAgent } from "../lib/agent/web-agent.js";
import { startAgentsJsonAgent } from "../lib/agent/mcp-agent.js";
import { saveDemoCapture } from "../lib/agent/demo-capture.js";
import type { AgentDemoEvent, StreamEndEvent } from "../lib/agent/types.js";

const agent = new Hono();

// POST /api/agent/demo — runs both agents in parallel, streams SSE
agent.post("/demo", async (c) => {
  let body: { domain?: string; question?: string; session_id?: string; model?: string; capture?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { domain, question, session_id, model, capture } = body;

  if (!domain || !question || !session_id) {
    return c.json({ error: "Missing required fields: domain, question, session_id" }, 400);
  }

  // Validate domain has agents.json from the explorer
  const agentsJson = readAgentsJson(domain);
  if (!agentsJson) {
    return c.json({ error: `No agents.json found for ${domain}. Run the agent explorer first.` }, 404);
  }

  const siteUrl = `https://${agentsJson.site.domain}`;

  // Demo capture: collect all events with high-resolution timestamps for replay
  const capturedEvents: Array<{ t: number; event: AgentDemoEvent | StreamEndEvent }> = [];
  const captureStart = Date.now();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: AgentDemoEvent | StreamEndEvent) => {
        // Always capture events when capture mode is on
        if (capture) {
          capturedEvents.push({ t: Date.now() - captureStart, event: data });
        }

        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Stream already closed
        }
      };

      const leftDone = startWebAgent(siteUrl, domain, question, send, model).catch(
        (err) => {
          send({
            side: "left",
            type: "error",
            content: `Agent error: ${err instanceof Error ? err.message : String(err)}`,
          });
          send({ side: "left", type: "done" });
        },
      );

      const rightDone = startAgentsJsonAgent(siteUrl, domain, question, send, model).catch((err) => {
        send({
          side: "right",
          type: "error",
          content: `Agent error: ${err instanceof Error ? err.message : String(err)}`,
        });
        send({ side: "right", type: "done" });
      });

      Promise.allSettled([leftDone, rightDone]).then(() => {
        send({ type: "stream:end" });

        // Save the captured demo if capture mode was on
        if (capture && domain) {
          saveDemoCapture({
            domain,
            question: question!,
            model: model || null,
            captured_at: new Date().toISOString(),
            duration_ms: Date.now() - captureStart,
            event_count: capturedEvents.length,
            events: capturedEvents,
          });
        }

        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

export default agent;
