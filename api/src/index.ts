import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import dotenv from "dotenv";

// Load .env.local (Hono/Node doesn't auto-load like Next.js)
dotenv.config({ path: ".env.local" });

import siteRoutes from "./routes/site.js";
import agentRoutes from "./routes/agent.js";
import agentExploreRoutes from "./routes/agent-explore.js";
import earlyAccessRoutes from "./routes/early-access.js";

const app = new Hono();

// CORS — allow frontend dev server (for direct SSE calls)
app.use(
  "/api/*",
  cors({
    origin: (origin) => origin ?? "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "x-admin-code"],
  })
);

// Health check
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// API routes
app.route("/api/site", siteRoutes);
app.route("/api/agent", agentRoutes);
app.route("/api/agent", agentExploreRoutes);
app.route("/api/early-access", earlyAccessRoutes);

const port = parseInt(process.env.PORT || "4001", 10);

console.log(`AgentWeb API starting on port ${port}...`);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`AgentWeb API running at http://localhost:${info.port}`);
});

export default app;
