import * as fs from "fs";
import * as path from "path";
import { Hono } from "hono";
import { readAgentsJson } from "../lib/agent-docs/reader.js";

const OUTPUT_DIR = process.env.OUTPUT_DIR || "output";

const site = new Hono();

// GET /api/site/:domain/agents — returns agents.json if available
site.get("/:domain/agents", (c) => {
  const domain = c.req.param("domain");
  const agentsJson = readAgentsJson(domain);
  if (!agentsJson) {
    return c.json({ error: `No agent documentation for ${domain}` }, 404);
  }
  return c.json(agentsJson);
});

// GET /api/site/:domain/explorer-meta
site.get("/:domain/explorer-meta", (c) => {
  const domain = c.req.param("domain");
  const metaPath = path.join(OUTPUT_DIR, domain, "explorer-meta.json");
  try {
    if (!fs.existsSync(metaPath)) {
      return c.json({ error: `No explorer metadata for ${domain}` }, 404);
    }
    const data = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    return c.json(data);
  } catch {
    return c.json({ error: `Failed to read explorer metadata for ${domain}` }, 500);
  }
});

export default site;
