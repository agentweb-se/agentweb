/**
 * Tool definitions and executors for the explorer agent.
 * 4 tools: fetch_page, browser_action, http_request, write_section
 */
import type { ToolDef } from "../agent/types";
import { extractPage as defaultExtractPage } from "../extract";
import type { CrawlPage } from "../crawl/types";
import type { AgentsJson } from "./schema";
import { BrowserSession } from "./browser-tool";

// --- Dependency injection ---

export type ExplorerToolDependencies = {
  fetch: typeof globalThis.fetch;
  extractPage: typeof defaultExtractPage;
};

function resolveToolDeps(overrides?: Partial<ExplorerToolDependencies>): ExplorerToolDependencies {
  return {
    fetch: overrides?.fetch ?? globalThis.fetch,
    extractPage: overrides?.extractPage ?? defaultExtractPage,
  };
}

// --- Tool Definitions (Anthropic format) ---

export const FETCH_PAGE_TOOL: ToolDef = {
  name: "fetch_page",
  description:
    "Fetch a URL via HTTP GET and return structured extracted content (title, meta, headings, text, links, forms, navigation, images). Use this to read and understand pages on the site. Returns clean extracted data, not raw HTML.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The full URL to fetch and extract content from",
      },
    },
    required: ["url"],
  },
};

export const HTTP_REQUEST_TOOL: ToolDef = {
  name: "http_request",
  description:
    "Make any HTTP request (GET, POST, PUT, etc.) and see the response. Use this to test API endpoints, submit search queries, probe form actions, or verify that a discovered endpoint works. Returns status code, headers, and response body. Can also call external API domains that were discovered via browser_action (e.g. algolia.net, elasticsearch endpoints).",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to request",
      },
      method: {
        type: "string",
        description: "HTTP method: GET, POST, PUT, DELETE, etc. Defaults to GET.",
      },
      headers: {
        type: "object",
        description:
          'Optional HTTP headers as key-value pairs (e.g. { "Content-Type": "application/json" })',
      },
      params: {
        type: "object",
        description:
          "Query parameters as key-value pairs. Appended to URL for GET, included in body for POST.",
      },
      body: {
        type: "string",
        description:
          "Request body as a string. For JSON, stringify it. Only used for POST/PUT/PATCH.",
      },
    },
    required: ["url"],
  },
};

export const WRITE_SECTION_TOOL: ToolDef = {
  name: "write_section",
  description:
    "Write a section to the agents.json API document. Call this IMMEDIATELY after you discover and test a capability — do NOT wait until the end. Each call updates the live document that the user sees building in real time. The section path uses dot notation: 'site', 'instructions.search', 'capabilities.navigation', 'pages', 'presentation', etc.",
  input_schema: {
    type: "object",
    properties: {
      section: {
        type: "string",
        description:
          "Dot-path to the section: 'site', 'instructions.search', 'instructions.browse', 'instructions.product_pages', 'instructions.contact', 'instructions.general', 'presentation', 'pages', 'capabilities.navigation', 'capabilities.search', etc.",
      },
      data: {
        type: "object",
        description: "The JSON data for this section, matching the agents.json schema",
      },
    },
    required: ["section", "data"],
  },
};

export const BROWSER_ACTION_TOOL: ToolDef = {
  name: "browser_action",
  description:
    `Control a real Chrome browser. The page persists between calls — you can navigate, then type, then click, then read results. All XHR/fetch API calls are captured automatically.

Actions:
- "goto" (url) — Navigate to a URL. Sets up network capture.
- "type" (selector, text) — Type text into an input field (clears existing text first).
- "click" (selector) — Click an element (button, link, etc).
- "wait" (selector) — Wait for an element to appear (max 15s).
- "evaluate" (script) — Run JavaScript in the page and return the result.
- "content" — Read the page: rendered text, links, forms, AND all API calls captured since last "content" read. This is how you discover hidden APIs.

Typical flow: goto → type search query → click submit → wait for results → content (see products + API calls).`,
  input_schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["goto", "type", "click", "wait", "evaluate", "content"],
        description: "The browser action to perform",
      },
      url: {
        type: "string",
        description: 'URL to navigate to (for "goto")',
      },
      selector: {
        type: "string",
        description: 'CSS selector for the target element (for "type", "click", "wait")',
      },
      text: {
        type: "string",
        description: 'Text to type (for "type")',
      },
      script: {
        type: "string",
        description: 'JavaScript to execute in the page context (for "evaluate"). Return a value to see it.',
      },
      timeout: {
        type: "number",
        description: 'Max wait time in ms (for "wait", default 10000, max 15000)',
      },
    },
    required: ["action"],
  },
};

/** Manifesto agent: just read + write. No browser, no HTTP probing. */
export const MANIFESTO_TOOLS: ToolDef[] = [
  FETCH_PAGE_TOOL,
  WRITE_SECTION_TOOL,
];

/** Search agent (and future capability agents): full toolset. */
export const EXPLORER_TOOLS: ToolDef[] = [
  FETCH_PAGE_TOOL,
  BROWSER_ACTION_TOOL,
  HTTP_REQUEST_TOOL,
  WRITE_SECTION_TOOL,
];

// --- Tool Executors ---

type SendFn = (data: Record<string, unknown>) => void;

/** Counters for the explorer run — no hard limits, only wall time stops the agent */
export interface ExplorerLimits {
  pagesFetched: number;
  httpRequests: number;
  browserActions: number;
  /** External domains discovered via browser API call capture — allowed for http_request */
  discoveredExternalDomains: Set<string>;
}

/**
 * Create the tool executor for the explorer agent.
 * Handles fetch_page, browser_action, http_request, and write_section.
 *
 * allowedSections scopes which sections this agent can write to.
 * If set, writes to other sections are rejected with a clear message.
 */
export function createExplorerToolExecutor(
  targetDomain: string,
  doc: AgentsJson,
  send: SendFn,
  limits: ExplorerLimits,
  browserSession: BrowserSession,
  allowedSections?: string[],
  deps?: Partial<ExplorerToolDependencies>,
) {
  const d = resolveToolDeps(deps);
  return async (
    name: string,
    input: Record<string, unknown>,
  ): Promise<string> => {
    switch (name) {
      case "fetch_page":
        return executeFetchPage(input.url as string, targetDomain, limits, d);
      case "browser_action":
        return browserSession.execute(
          input.action as string,
          input,
        );
      case "http_request":
        return executeHttpRequest(input, targetDomain, limits, d);
      case "write_section":
        return executeWriteSection(
          input.section as string,
          input.data as Record<string, unknown>,
          doc,
          send,
          allowedSections,
        );
      default:
        return `Unknown tool: ${name}`;
    }
  };
}

// --- fetch_page ---

async function executeFetchPage(
  url: string,
  targetDomain: string,
  limits: ExplorerLimits,
  deps: ExplorerToolDependencies,
): Promise<string> {
  // Domain validation — stay on the target site
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(targetDomain) && parsed.hostname !== targetDomain) {
      return `Skipped: ${url} is not on ${targetDomain}. Stay on the target domain.`;
    }
  } catch {
    return `Invalid URL: ${url}`;
  }

  limits.pagesFetched++;

  try {
    const response = await deps.fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AgentWeb/1.0; +https://agentweb.io)",
        Accept: "text/html,application/xhtml+xml,*/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return `HTTP ${response.status} ${response.statusText} for ${url}`;
    }

    const html = await response.text();
    const crawlPage: CrawlPage = {
      url,
      html,
      markdown: "",
      title: "",
    };

    const page = deps.extractPage(crawlPage);

    // Build a readable summary for the agent
    const summary: Record<string, unknown> = {
      url: page.url,
      title: page.title,
      meta: page.meta,
    };

    // Extract JSON-LD structured data
    try {
      const { load } = await import("cheerio");
      const $ = load(html);
      const jsonLdBlocks: unknown[] = [];
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const text = $(el).text().trim();
          if (text) jsonLdBlocks.push(JSON.parse(text));
        } catch {
          // Skip malformed JSON-LD
        }
      });
      if (jsonLdBlocks.length > 0) {
        summary.structured_data = jsonLdBlocks;
      }
    } catch {
      // Cheerio not available or parse error — skip
    }

    // Flatten sections into readable text
    const textBlocks: string[] = [];
    for (const section of page.sections) {
      if (section.heading) {
        textBlocks.push(`${"#".repeat(section.heading.level)} ${section.heading.text}`);
      }
      for (const block of section.content) {
        if (block.type === "text") textBlocks.push(block.text);
        else if (block.type === "list") textBlocks.push(block.items.join("\n"));
        else if (block.type === "table") {
          if (block.headers) textBlocks.push(block.headers.join(" | "));
          for (const row of block.rows.slice(0, 5)) textBlocks.push(row.join(" | "));
        }
      }
      for (const sub of section.subsections) {
        if (sub.heading) {
          textBlocks.push(`${"#".repeat(sub.heading.level)} ${sub.heading.text}`);
        }
        for (const block of sub.content) {
          if (block.type === "text") textBlocks.push(block.text);
        }
      }
    }
    summary.content_text = textBlocks.join("\n").slice(0, 8000);

    // Navigation links
    const navLinks = page.actions
      .filter((a) => a.type === "navigate")
      .slice(0, 50)
      .map((a) => ({ label: a.label, url: a.url }));
    if (navLinks.length > 0) summary.links = navLinks;

    // Forms
    const forms = page.actions
      .filter((a) => a.type === "submit")
      .map((a) => ({
        label: a.label,
        url: a.url,
        method: a.method,
        fields: a.fields,
      }));
    if (forms.length > 0) summary.forms = forms;

    // Downloads
    const downloads = page.actions
      .filter((a) => a.type === "download")
      .slice(0, 10)
      .map((a) => ({ label: a.label, url: a.url, filetype: a.filetype }));
    if (downloads.length > 0) summary.downloads = downloads;

    const result = JSON.stringify(summary, null, 2);
    // Truncate if massive
    return result.length > 12000 ? result.slice(0, 12000) + "\n... (truncated)" : result;
  } catch (err) {
    return `Fetch error for ${url}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// --- http_request ---

async function executeHttpRequest(
  input: Record<string, unknown>,
  targetDomain: string,
  limits: ExplorerLimits,
  deps: ExplorerToolDependencies,
): Promise<string> {
  const url = input.url as string;
  const method = ((input.method as string) || "GET").toUpperCase();
  const headers = (input.headers as Record<string, string>) || {};
  const params = input.params as Record<string, string> | undefined;
  const body = input.body as string | undefined;

  // Domain validation — allow target domain + discovered external APIs
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const onTarget = host.endsWith(targetDomain) || host === targetDomain;
    const onDiscovered = limits.discoveredExternalDomains.has(host);
    if (!onTarget && !onDiscovered) {
      return `Skipped: ${url} is not on ${targetDomain} and was not discovered via browser. Stay on the target domain, or use browser_action to discover external APIs first.`;
    }
  } catch {
    return `Invalid URL: ${url}`;
  }

  limits.httpRequests++;

  try {
    let finalUrl = url;
    let requestBody: string | undefined;

    if (params && method === "GET") {
      const u = new URL(url);
      for (const [k, v] of Object.entries(params)) {
        u.searchParams.set(k, v);
      }
      finalUrl = u.toString();
    } else if (params && method !== "GET") {
      requestBody = JSON.stringify(params);
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }
    }

    if (body) {
      requestBody = body;
    }

    const response = await deps.fetch(finalUrl, {
      method,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AgentWeb/1.0; +https://agentweb.io)",
        Accept: "*/*",
        ...headers,
      },
      body: requestBody,
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    const contentType = response.headers.get("content-type") || "";
    let responseBody: string;

    if (contentType.includes("application/json")) {
      try {
        const json = await response.json();
        responseBody = JSON.stringify(json, null, 2);
      } catch {
        responseBody = await response.text();
      }
    } else {
      responseBody = await response.text();
    }

    // Truncate
    if (responseBody.length > 20000) {
      responseBody = responseBody.slice(0, 20000) + "\n... (truncated)";
    }

    return JSON.stringify(
      {
        status: response.status,
        status_text: response.statusText,
        content_type: contentType,
        body: responseBody,
      },
      null,
      2,
    );
  } catch (err) {
    return `Request error for ${url}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// --- write_section ---

export function executeWriteSection(
  section: string,
  data: Record<string, unknown>,
  doc: AgentsJson,
  send: SendFn,
  allowedSections?: string[],
): string {
  // Reject writes to auto-managed metadata fields
  const autoManaged = ["version", "generated_at", "generator"];
  if (autoManaged.includes(section)) {
    return `"${section}" is auto-managed. Skip it — it's set automatically.`;
  }

  // Scope enforcement — each agent can only write its own sections
  if (allowedSections && allowedSections.length > 0) {
    const allowed = allowedSections.some((s) => section === s || section.startsWith(s + "."));
    if (!allowed) {
      return `"${section}" is not your job. You can only write: ${allowedSections.join(", ")}. Focus on your task.`;
    }
  }

  // Set value at dot-path in doc
  const parts = section.split(".");

  if (parts.length === 1) {
    // Top-level: "site", "instructions", "presentation", "pages"
    const key = parts[0] as keyof AgentsJson;
    if (!(key in doc)) {
      return `Unknown section: ${section}. Valid top-level keys: site, instructions, presentation, pages, capabilities`;
    }
    (doc as Record<string, unknown>)[key] = data;
  } else if (parts.length === 2) {
    // Nested: "instructions.search", "capabilities.navigation", etc.
    const [parent, child] = parts;
    if (parent === "instructions") {
      (doc.instructions as Record<string, unknown>)[child] = data;
    } else if (parent === "capabilities") {
      (doc.capabilities as Record<string, unknown>)[child] = data;
    } else if (parent === "presentation") {
      (doc.presentation as Record<string, unknown>)[child] = data;
    } else {
      return `Unknown parent section: ${parent}. Use 'instructions.X', 'capabilities.X', or 'presentation.X' for nested paths.`;
    }
  } else {
    return `Invalid section path: ${section}. Use 'site', 'instructions.search', 'capabilities.navigation', etc.`;
  }

  // Emit section-written event for the right panel
  send({
    type: "section-written",
    section,
    data,
  });

  // Check if all allowed sections have been written — signal the agent to stop
  if (allowedSections && allowedSections.length > 0) {
    const allWritten = allowedSections.every((s) => {
      const sParts = s.split(".");
      if (sParts.length === 1) {
        const val = (doc as Record<string, unknown>)[sParts[0]];
        return val !== undefined && val !== null && (typeof val !== "object" || Object.keys(val as object).length > 0);
      }
      if (sParts.length === 2) {
        const [parent, child] = sParts;
        const parentObj = (doc as Record<string, Record<string, unknown>>)[parent];
        return parentObj?.[child] !== undefined && parentObj[child] !== null;
      }
      return false;
    });

    if (allWritten) {
      return `Section "${section}" written successfully. ALL REQUIRED SECTIONS ARE NOW COMPLETE. Your job is done — do not make any more tool calls. Stop immediately.`;
    }
  }

  return `Section "${section}" written successfully.`;
}
