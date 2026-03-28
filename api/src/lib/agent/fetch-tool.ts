/**
 * Shared fetch_url tool — used by both LEFT and RIGHT agents.
 * Domain-restricted, rate-limited HTTP fetcher.
 *
 * Supports GET and POST with custom headers — both agents get the same tool.
 * The advantage of agents.json is KNOWING what to call, not having a better tool.
 *
 * External domains are blocked by default. RIGHT agent gets a whitelist
 * extracted from agents.json (e.g., algolia.net for search APIs).
 */
import type { ToolDef } from "./types";

export const MAX_FETCHES = 15;
export const MAX_CHARS_PER_FETCH = 50_000;

export const FETCH_URL_TOOL: ToolDef = {
  name: "fetch_url",
  description:
    "Fetch a URL and return the response. Supports GET (default) and POST with custom headers. Use this to load web pages or call API endpoints documented in the operating manual.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The full URL to fetch",
      },
      method: {
        type: "string",
        description: "HTTP method — GET (default) or POST",
      },
      headers: {
        type: "object",
        description: "Custom request headers (e.g., API keys, Content-Type)",
      },
      body: {
        type: "string",
        description: "Request body for POST requests (JSON string)",
      },
    },
    required: ["url"],
  },
};

/**
 * Extract all hostnames mentioned in agents.json URLs.
 * These become the external domain whitelist for the RIGHT agent.
 */
export function extractApiDomains(agentsJson: object): Set<string> {
  const domains = new Set<string>();
  const json = JSON.stringify(agentsJson);
  const urls = json.match(/https?:\/\/[^\s"',}\\]+/g) || [];
  for (const url of urls) {
    try {
      domains.add(new URL(url).hostname);
    } catch { /* skip */ }
  }
  return domains;
}

// --- Dependency injection ---

export type FetchToolDependencies = {
  fetch: typeof globalThis.fetch;
  timeout: number;
  maxFetches: number;
  maxChars: number;
};

function resolveFetchToolDeps(overrides?: Partial<FetchToolDependencies>): FetchToolDependencies {
  return {
    fetch: overrides?.fetch ?? globalThis.fetch,
    timeout: overrides?.timeout ?? 10_000,
    maxFetches: overrides?.maxFetches ?? MAX_FETCHES,
    maxChars: overrides?.maxChars ?? MAX_CHARS_PER_FETCH,
  };
}

// --- Public API ---

export function createFetchExecutor(
  domain: string,
  allowedExternalDomains?: Set<string>,
  deps?: Partial<FetchToolDependencies>,
): (name: string, input: Record<string, unknown>) => Promise<string> {
  const d = resolveFetchToolDeps(deps);
  let fetchCount = 0;
  const external = allowedExternalDomains || new Set<string>();

  return async (name: string, input: Record<string, unknown>) => {
    if (name !== "fetch_url") {
      throw new Error(`Unknown tool: ${name}`);
    }

    const url = input.url as string;
    if (!url) throw new Error("url parameter is required");

    // Domain restriction — prevent SSRF
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    const targetDomain = domain.replace(/^www\./, "");
    const fetchDomain = parsed.hostname.replace(/^www\./, "");
    const isTargetDomain = fetchDomain === targetDomain || parsed.hostname.endsWith(`.${targetDomain}`);
    const isAllowedExternal = external.has(parsed.hostname);

    if (!isTargetDomain && !isAllowedExternal) {
      throw new Error(
        `Cannot fetch URLs outside of ${domain}. Requested: ${parsed.hostname}`,
      );
    }

    fetchCount++;
    if (fetchCount > d.maxFetches) {
      throw new Error(
        `Maximum fetch limit reached (${d.maxFetches}). You need to work with the data you've already fetched.`,
      );
    }

    const method = ((input.method as string) || "GET").toUpperCase();
    const customHeaders = (input.headers || {}) as Record<string, string>;
    const body = input.body as string | undefined;

    try {
      const fetchInit: RequestInit = {
        method,
        headers: {
          "User-Agent": "AgentWeb-Demo/1.0",
          Accept: "text/html,application/json,application/xhtml+xml,*/*",
          ...customHeaders,
        },
        signal: AbortSignal.timeout(d.timeout),
      };

      if (body && method === "POST") {
        fetchInit.body = body;
        if (!customHeaders["Content-Type"] && !customHeaders["content-type"]) {
          (fetchInit.headers as Record<string, string>)["Content-Type"] = "application/json";
        }
      }

      const resp = await d.fetch(url, fetchInit);

      if (!resp.ok) {
        return `HTTP ${resp.status} ${resp.statusText} — failed to fetch ${url}`;
      }

      const text = await resp.text();
      const contentType = resp.headers.get("content-type") || "";
      const truncated = text.slice(0, d.maxChars);
      const wasTruncated = text.length > d.maxChars;

      return [
        `--- Fetched ${url} ---`,
        `Status: ${resp.status}`,
        `Content-Type: ${contentType}`,
        `Content-Length: ${text.length} characters${wasTruncated ? ` (truncated to ${d.maxChars})` : ""}`,
        `Fetches remaining: ${d.maxFetches - fetchCount}`,
        ``,
        truncated,
      ].join("\n");
    } catch (err) {
      return `Failed to fetch ${url}: ${err instanceof Error ? err.message : String(err)}`;
    }
  };
}
