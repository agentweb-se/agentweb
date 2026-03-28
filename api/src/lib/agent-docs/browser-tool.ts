/**
 * browser_action tool — persistent browser session with full interaction.
 *
 * The agent controls a real Chrome tab: navigate, type, click, wait,
 * run JavaScript, and read rendered content + captured API calls.
 * The page persists across calls so the agent can interact step by step.
 */
import type { Browser, Page, HTTPResponse } from "puppeteer";
import { isNoiseRequest, isApiLikeResponse } from "../discover/types";
import type { ExplorerLimits } from "./tools";

interface CapturedApiCall {
  url: string;
  method: string;
  status: number;
  content_type: string;
  body_preview?: string;
}

export type BrowserSessionOptions = {
  viewport: { width: number; height: number };
  userAgent: string;
  clickDelay: number;
};

const defaultBrowserSessionOptions: BrowserSessionOptions = {
  viewport: { width: 1280, height: 800 },
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  clickDelay: 1000,
};

function resolveBrowserSessionOptions(
  partial?: Partial<BrowserSessionOptions>,
): BrowserSessionOptions {
  if (!partial) return defaultBrowserSessionOptions;
  return {
    viewport: partial.viewport ?? defaultBrowserSessionOptions.viewport,
    userAgent: partial.userAgent ?? defaultBrowserSessionOptions.userAgent,
    clickDelay: partial.clickDelay ?? defaultBrowserSessionOptions.clickDelay,
  };
}

/**
 * Persistent browser session — one page, reused across tool calls.
 * API calls accumulate between "content" reads.
 */
export class BrowserSession {
  private page: Page | null = null;
  private apiCalls: CapturedApiCall[] = [];
  private bodyPromises: Promise<void>[] = [];
  private getBrowser: () => Promise<Browser>;
  private targetDomain: string;
  private limits: ExplorerLimits;
  private options: BrowserSessionOptions;

  constructor(
    getBrowser: () => Promise<Browser>,
    targetDomain: string,
    limits: ExplorerLimits,
    options?: Partial<BrowserSessionOptions>,
  ) {
    this.getBrowser = getBrowser;
    this.targetDomain = targetDomain;
    this.limits = limits;
    this.options = resolveBrowserSessionOptions(options);
  }

  async execute(
    action: string,
    input: Record<string, unknown>,
  ): Promise<string> {
    this.limits.browserActions++;

    try {
      switch (action) {
        case "goto":
          return await this.goto(input.url as string);
        case "type":
          return await this.type(input.selector as string, input.text as string);
        case "click":
          return await this.click(input.selector as string);
        case "wait":
          return await this.wait(input.selector as string, input.timeout as number | undefined);
        case "evaluate":
          return await this.evaluate(input.script as string);
        case "content":
          return await this.content();
        default:
          return `Unknown action: ${action}. Use: goto, type, click, wait, evaluate, content`;
      }
    } catch (err) {
      return `Browser error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  /** Navigate to a URL. Sets up network capture on first call. */
  private async goto(url: string): Promise<string> {
    // Domain validation on navigation
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.endsWith(this.targetDomain) && parsed.hostname !== this.targetDomain) {
        return `Skipped: ${url} is not on ${this.targetDomain}. Stay on the target domain.`;
      }
    } catch {
      return `Invalid URL: ${url}`;
    }

    const page = await this.ensurePage();

    // DON'T clear apiCalls here — they accumulate between content() reads.
    // If the agent typed a search (triggering Algolia), then navigated,
    // we need those API calls to survive until the next content() read.

    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("timeout") && !msg.includes("Timeout")) throw err;
      // Timeout is OK — proceed with partial results
    }

    const title = await page.title();
    return `Navigated to ${url} — "${title}". Use "content" to read the page, or interact first (type, click).`;
  }

  /** Type text into an element. */
  private async type(selector: string, text: string): Promise<string> {
    const page = await this.requirePage();

    try {
      // Clear existing text first, then type
      await page.click(selector, { count: 3 }); // triple-click to select all
      await page.type(selector, text, { delay: 30 });
    } catch (err) {
      // Fallback: try evaluate-based typing
      try {
        await page.evaluate((sel: string, val: string) => {
          const el = document.querySelector(sel) as HTMLInputElement;
          if (!el) throw new Error(`Element not found: ${sel}`);
          el.value = val;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }, selector, text);
      } catch {
        return `Could not type into "${selector}": ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    return `Typed "${text}" into ${selector}. API calls may be firing (autocomplete, etc). Use "content" to see results, or "wait" for a specific element.`;
  }

  /** Click an element. */
  private async click(selector: string): Promise<string> {
    const page = await this.requirePage();

    try {
      await page.click(selector);
    } catch {
      // Fallback: JS click
      try {
        await page.evaluate((sel: string) => {
          const el = document.querySelector(sel);
          if (!el) throw new Error(`Element not found: ${sel}`);
          (el as HTMLElement).click();
        }, selector);
      } catch (err2) {
        return `Could not click "${selector}": ${err2 instanceof Error ? err2.message : String(err2)}`;
      }
    }

    // Brief pause for any resulting navigation/XHR
    await new Promise((r) => setTimeout(r, this.options.clickDelay));

    return `Clicked ${selector}. Use "wait" if you expect new content, or "content" to read the page.`;
  }

  /** Wait for a selector to appear. */
  private async wait(selector: string, timeout?: number): Promise<string> {
    const page = await this.requirePage();
    const ms = Math.min(timeout || 10000, 15000);

    try {
      await page.waitForSelector(selector, { timeout: ms });
      return `Element "${selector}" is now visible.`;
    } catch {
      return `Timeout waiting for "${selector}" after ${ms}ms. The element may not exist. Use "content" to see what's on the page.`;
    }
  }

  /** Execute JavaScript in the page context and return the result. */
  private async evaluate(script: string): Promise<string> {
    const page = await this.requirePage();

    try {
      const result = await page.evaluate(script);
      const str = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return (str || "(undefined)").slice(0, 10000);
    } catch (err) {
      return `Script error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  /** Read current page content + all API calls captured since last read. */
  private async content(): Promise<string> {
    const page = await this.requirePage();

    // Wait for pending body reads
    await Promise.allSettled(this.bodyPromises);
    this.bodyPromises = [];

    const extracted = await page.evaluate(() => {
      const title = document.title || "";
      // Keep text short — api_calls are the priority
      const bodyText = (document.body?.innerText || "").slice(0, 3000);

      const links: { text: string; href: string }[] = [];
      const anchors = document.querySelectorAll("a[href]");
      for (let i = 0; i < Math.min(anchors.length, 15); i++) {
        const a = anchors[i] as HTMLAnchorElement;
        const text = (a.textContent || "").trim().slice(0, 80);
        if (text && a.href) links.push({ text, href: a.href });
      }

      const forms: { action: string; method: string; fields: string[] }[] = [];
      document.querySelectorAll("form").forEach((form) => {
        const fields: string[] = [];
        form.querySelectorAll("input, select, textarea").forEach((el) => {
          const name = el.getAttribute("name");
          const type = el.getAttribute("type") || el.tagName.toLowerCase();
          if (name) fields.push(`${name} (${type})`);
        });
        forms.push({
          action: form.action || "",
          method: (form.method || "GET").toUpperCase(),
          fields,
        });
      });

      return { title, bodyText, links, forms };
    });

    // Snapshot and clear api_calls
    const apiCalls = [...this.apiCalls];
    this.apiCalls = [];

    // Add discovered external domains to the whitelist
    for (const call of apiCalls) {
      try {
        const callHost = new URL(call.url).hostname;
        if (callHost !== this.targetDomain && !callHost.endsWith(this.targetDomain)) {
          this.limits.discoveredExternalDomains.add(callHost);
        }
      } catch { /* skip invalid URLs */ }
    }

    // Build result with api_calls FIRST — they're the most valuable part.
    // Text/links are secondary context. api_calls must never be truncated.
    const result = {
      url: page.url(),
      title: extracted.title,
      // api_calls go first so they're never truncated
      api_calls: apiCalls,
      total_api_calls: apiCalls.length,
      text: extracted.bodyText,
      links: extracted.links,
      forms: extracted.forms,
    };

    // Truncate api_call body previews if needed
    for (const call of result.api_calls) {
      if (call.body_preview && call.body_preview.length > 1500) {
        call.body_preview = call.body_preview.slice(0, 1500) + "...";
      }
    }

    let json = JSON.stringify(result, null, 2);
    if (json.length > 18000) {
      // Aggressively truncate text to make room for api_calls
      result.text = result.text.slice(0, 1500) + "\n... (truncated)";
      result.links = result.links.slice(0, 10);
      json = JSON.stringify(result, null, 2);
      if (json.length > 18000) {
        // Last resort: truncate body_previews further
        for (const call of result.api_calls) {
          if (call.body_preview && call.body_preview.length > 500) {
            call.body_preview = call.body_preview.slice(0, 500) + "...";
          }
        }
        json = JSON.stringify(result, null, 2);
        if (json.length > 18000) {
          json = json.slice(0, 18000) + "\n... (truncated)";
        }
      }
    }

    return json;
  }

  /** Ensure we have a page — create one if needed, with network capture. */
  private async ensurePage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;

    let browser: Browser;
    try {
      browser = await this.getBrowser();
    } catch (err) {
      throw new Error(`Chrome not available: ${err instanceof Error ? err.message : String(err)}`);
    }

    const page = await browser.newPage();
    await page.setViewport(this.options.viewport);
    await page.setUserAgent(this.options.userAgent);

    // Network capture — runs for the lifetime of this page
    page.on("response", (response: HTTPResponse) => {
      const req = response.request();
      const resourceType = req.resourceType();
      if (resourceType !== "xhr" && resourceType !== "fetch") return;

      const respUrl = response.url();
      if (isNoiseRequest(respUrl)) return;

      const contentType = response.headers()["content-type"] || "";
      const call: CapturedApiCall = {
        url: respUrl,
        method: req.method(),
        status: response.status(),
        content_type: contentType,
      };

      if (isApiLikeResponse(contentType)) {
        const bodyPromise = response
          .text()
          .then((body) => { call.body_preview = body.slice(0, 2000); })
          .catch(() => { /* skip */ });
        this.bodyPromises.push(bodyPromise);
      }

      this.apiCalls.push(call);
    });

    this.page = page;
    return page;
  }

  /** Require an existing page — error if none. */
  private async requirePage(): Promise<Page> {
    if (!this.page || this.page.isClosed()) {
      throw new Error('No page open. Use action "goto" first to navigate to a URL.');
    }
    return this.page;
  }

  /** Close the page (not the browser). */
  async close(): Promise<void> {
    if (this.page && !this.page.isClosed()) {
      try { await this.page.close(); } catch { /* ignore */ }
    }
    this.page = null;
  }
}
