import type { CheerioAPI } from "cheerio";
import type { Action, ActionContext, FormField } from "../schema";

const DOWNLOAD_EXTS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv",
  ".zip", ".rar", ".gz", ".tar", ".7z",
  ".txt", ".rtf", ".ppt", ".pptx",
  ".mp3", ".mp4", ".avi", ".mov", ".wav", ".epub",
]);

function resolveUrl(href: string, pageUrl: string): string {
  try {
    return new URL(href, pageUrl).href;
  } catch {
    return href;
  }
}

function isDownloadUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    for (const ext of Array.from(DOWNLOAD_EXTS)) {
      if (pathname.endsWith(ext)) return true;
    }
  } catch {
    // not a valid URL
  }
  return false;
}

function getFiletype(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const dot = pathname.lastIndexOf(".");
    if (dot !== -1) return pathname.slice(dot + 1);
  } catch {
    // ignore
  }
  return undefined;
}

function getFilename(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const last = segments[segments.length - 1];
      if (last.includes(".")) return last;
    }
  } catch {
    // ignore
  }
  return undefined;
}

/** Block-level tags that warrant a separator in label text. */
const LABEL_BLOCK_TAGS = new Set([
  "div", "section", "article", "main", "aside", "header",
  "fieldset", "figure", "details", "summary", "address",
  "hgroup", "search", "form", "p", "li", "dt", "dd",
]);

const SKIP_TAGS = new Set([
  "script", "style", "noscript", "template", "svg",
]);

/**
 * Recursively walk child nodes, inserting " | " separators between
 * block-level elements to prevent product card text concatenation.
 */
function normalizeElementText($: CheerioAPI, el: ReturnType<CheerioAPI["fn"]["first"]>): string {
  const parts: string[] = [];
  let hasContent = false;

  function walk(node: Parameters<typeof $>[0]): void {
    $(node).contents().each((_, child) => {
      if (child.type === "text") {
        const text = $(child).text().replace(/\s+/g, " ");
        if (text.trim()) {
          parts.push(text);
          hasContent = true;
        }
      } else if (child.type === "tag") {
        const tag = ((child as { tagName?: string }).tagName || "").toLowerCase();
        if (SKIP_TAGS.has(tag)) return;
        if (LABEL_BLOCK_TAGS.has(tag) && hasContent) {
          parts.push(" | ");
        }
        walk(child);
      }
    });
  }

  walk(el);
  return parts.join("")
    .replace(/\s+/g, " ")
    .replace(/(\s*\|\s*){2,}/g, " | ")  // collapse 2+ consecutive separators
    .replace(/^\s*\|\s*/, "")            // trim leading separator
    .replace(/\s*\|\s*$/, "")            // trim trailing separator
    .trim();
}

function getLinkLabel($: CheerioAPI, el: ReturnType<CheerioAPI["fn"]["first"]>, resolved: string): string {
  const text = normalizeElementText($, el);
  if (text) return text;
  const ariaLabel = el.attr("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;
  const title = el.attr("title")?.trim();
  if (title) return title;
  return resolved;
}

/**
 * Determine the context of an element: nav, footer, or main.
 */
function getActionContext($: CheerioAPI, el: ReturnType<CheerioAPI["fn"]["first"]>): ActionContext {
  if (el.closest("nav, [role='navigation']").length > 0) return "nav";
  if (el.closest("header").length > 0 && el.closest("nav, [role='navigation']").length === 0) {
    // Links in header but not in nav — still treat as nav
    return "nav";
  }
  if (el.closest("footer").length > 0) return "footer";
  return "main";
}

/**
 * Extract all actions (navigate, submit, download) from a page.
 * Pure, synchronous, deterministic.
 */
export function extractActions(
  $: CheerioAPI,
  pageUrl: string
): Action[] {
  const actions: Action[] = [];
  const seenLinks = new Set<string>();
  const seenForms = new Set<string>();

  let pageHost: string;
  try {
    pageHost = new URL(pageUrl).hostname;
  } catch {
    pageHost = "";
  }

  // --- Links → navigate or download ---
  $("a[href]").each((_, el) => {
    const node = $(el);
    const href = node.attr("href")?.trim();
    if (!href) return;

    // Skip javascript: hrefs, # same-page anchors, data: URIs
    if (href.startsWith("javascript:")) return;
    if (href === "#") return;
    if (href.startsWith("data:")) return;

    const resolved = resolveUrl(href, pageUrl);

    // Deduplicate by resolved URL
    if (seenLinks.has(resolved)) return;
    seenLinks.add(resolved);

    const label = getLinkLabel($, node, resolved);
    const context = getActionContext($, node);

    if (isDownloadUrl(resolved)) {
      actions.push({
        type: "download",
        label,
        url: resolved,
        filename: getFilename(resolved),
        filetype: getFiletype(resolved),
        context,
      });
    } else {
      // Determine internal/external
      let internal = true;
      if (href.startsWith("mailto:") || href.startsWith("tel:")) {
        internal = false;
      } else {
        try {
          const linkHost = new URL(resolved).hostname;
          if (linkHost !== pageHost) internal = false;
        } catch {
          // keep as internal
        }
      }

      actions.push({
        type: "navigate",
        label,
        url: resolved,
        internal,
        context,
      });
    }
  });

  // --- Forms → submit ---
  $("form").each((_, el) => {
    const form = $(el);
    const rawAction = form.attr("action")?.trim();
    const formUrl = rawAction ? resolveUrl(rawAction, pageUrl) : pageUrl;
    const method = (form.attr("method")?.trim().toUpperCase()) || "GET";

    // Deduplicate by action URL + method
    const formKey = `${method}:${formUrl}`;
    if (seenForms.has(formKey)) return;
    seenForms.add(formKey);

    const fields: FormField[] = [];

    form.find("input, select, textarea").each((_, fieldEl) => {
      const field = $(fieldEl);
      const tagName = ((fieldEl as unknown as { tagName: string }).tagName || "").toLowerCase();
      if (tagName !== "input" && tagName !== "select" && tagName !== "textarea") return;

      const inputType = tagName === "input"
        ? (field.attr("type")?.trim() || "text")
        : tagName;

      // Skip hidden and submit types
      if (inputType === "hidden" || inputType === "submit" || inputType === "button") return;

      const name = field.attr("name")?.trim() || "";
      const required = field.attr("required") !== undefined;

      // Find label
      let label: string | undefined;
      const id = field.attr("id")?.trim();
      if (id) {
        const labelEl = $(`label[for="${id}"]`).first();
        if (labelEl.length) label = labelEl.text().trim();
      }
      if (!label) {
        const parentLabel = field.closest("label");
        if (parentLabel.length) {
          label = parentLabel.clone().children("input, select, textarea").remove().end().text().trim();
        }
      }
      if (!label) {
        label = field.attr("placeholder")?.trim() || undefined;
      }
      if (!label) {
        label = field.attr("aria-label")?.trim() || undefined;
      }

      // Extract <select> options
      let options: string[] | undefined;
      if (tagName === "select") {
        const opts: string[] = [];
        field.find("option").each((_, opt) => {
          const text = $(opt).text().trim();
          if (text) opts.push(text);
        });
        if (opts.length > 0) options = opts;
      }

      fields.push({ name, type: inputType, label, required, options });
    });

    // Form label: submit button text → aria-label → "Form"
    let formLabel: string;
    const submitBtn = form.find('button[type="submit"], input[type="submit"]').first();
    if (submitBtn.length) {
      formLabel = submitBtn.text().trim() || submitBtn.attr("value")?.trim() || "";
    } else {
      formLabel = form.find("button").first().text().trim() || "";
    }
    if (!formLabel) {
      formLabel = form.attr("aria-label")?.trim() || "Form";
    }

    const formContext = getActionContext($, form);
    actions.push({
      type: "submit",
      label: formLabel,
      url: formUrl,
      method,
      fields,
      context: formContext,
    });
  });

  return actions;
}
