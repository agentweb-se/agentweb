import type { CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type { ContentBlock, InlineLink } from "../schema";

const SKIP_TAGS = new Set([
  "script", "style", "noscript", "template", "head", "svg",
]);

/** Block-level tags that should get a separator when found inside inline context. */
const BLOCK_TAGS = new Set([
  "div", "section", "article", "main", "aside", "header",
  "fieldset", "figure", "details", "summary", "address",
  "hgroup", "search", "form",
]);

/** Tags that are inline-level and should not be recursed into as containers. */
const INLINE_TAGS = new Set([
  "span", "strong", "em", "b", "i", "a", "small", "mark",
  "sub", "sup", "abbr", "time", "data", "code", "u", "s",
  "del", "ins", "cite", "dfn", "kbd", "samp", "var", "wbr", "br",
  "bdi", "bdo", "q", "ruby", "rt", "rp",
]);


function resolveUrl(href: string, pageUrl: string): string {
  try {
    return new URL(href, pageUrl).href;
  } catch {
    return href;
  }
}

function getTagName(el: AnyNode): string {
  return ((el as Element).tagName || "").toLowerCase();
}

function isHidden($: CheerioAPI, el: AnyNode): boolean {
  const node = $(el);
  if (node.attr("hidden") !== undefined) return true;
  if (node.attr("aria-hidden") === "true") return true;
  const style = node.attr("style") || "";
  if (/display\s*:\s*none/i.test(style)) return true;
  if (/visibility\s*:\s*hidden/i.test(style)) return true;
  // Hidden microdata: <meta itemprop="..."> and <link itemprop="..."> in body
  const tag = getTagName(el);
  if ((tag === "meta" || tag === "link") && node.attr("itemprop")) return true;
  // Off-screen itemprop elements (position:absolute + left:-9999px)
  if (node.attr("itemprop") && /position\s*:\s*absolute/i.test(style) && /left\s*:\s*-\d{3,}px/i.test(style)) return true;
  return false;
}

/** Interactive/widget elements whose text is UI controls, not page content. */
const INTERACTIVE_TAGS = new Set([
  "button", "select", "option", "optgroup",
  "datalist", "output", "meter", "progress",
]);

/**
 * Check if a text string is noise (whitespace-only, zero-width chars, EAN barcodes).
 */
function isNoiseText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  // Zero-width / NBSP-only
  if (/^[\u00A0\u200B\u200C\u200D\uFEFF]+$/.test(text)) return true;
  // EAN/barcodes (13+ digits)
  if (/^\d{13,}$/.test(trimmed)) return true;
  return false;
}

function isInsideNav($: CheerioAPI, el: AnyNode): boolean {
  return $(el).closest("nav, [role='navigation']").length > 0;
}

/**
 * Walk inline children of a node, building a plain text string and recording
 * inline link positions with character offsets.
 */
export function extractTextWithLinks(
  $: CheerioAPI,
  node: AnyNode,
  pageUrl: string
): { text: string; links: InlineLink[] } {
  const parts: string[] = [];
  const links: InlineLink[] = [];
  let offset = 0;

  function walkInline(n: AnyNode): void {
    const children = $(n).contents();
    children.each((_, child) => {
      if (child.type === "text") {
        const raw = $(child).text();
        // Collapse whitespace but preserve a single space between words
        const cleaned = raw.replace(/\s+/g, " ");
        if (cleaned) {
          parts.push(cleaned);
          offset += cleaned.length;
        }
      } else if (child.type === "tag") {
        const tag = getTagName(child);
        if (tag === "br") {
          parts.push(" ");
          offset += 1;
        } else if (tag === "a") {
          const href = $(child).attr("href")?.trim();
          const start = offset;
          // Recurse into the <a> to get its text content
          walkInline(child);
          const end = offset;
          if (href && end > start) {
            const resolved = resolveUrl(href, pageUrl);
            // Only record real links, not anchors/javascript
            if (!href.startsWith("#") && !href.startsWith("javascript:") && !href.startsWith("data:")) {
              links.push({
                text: parts.slice(parts.length - (end - start === offset - start ? 1 : 0)).join("").slice(-(end - start)) || $(child).text().trim(),
                url: resolved,
                start,
                end,
              });
            }
          }
        } else if (SKIP_TAGS.has(tag)) {
          // skip
        } else if (INTERACTIVE_TAGS.has(tag)) {
          // skip interactive elements in inline context too
        } else if ($(child).attr("itemprop") && $(child).children().length === 0) {
          // Skip microdata leaf values (e.g. <span itemprop="price">2299</span>)
        } else if (BLOCK_TAGS.has(tag)) {
          // Block-level child inside inline context — add separator
          if (offset > 0) { parts.push(" | "); offset += 3; }
          walkInline(child);
        } else {
          // Other inline tags — recurse
          walkInline(child);
        }
      }
    });
  }

  walkInline(node);

  // Join and clean up
  const rawText = parts.join("");
  const text = rawText.replace(/\s+/g, " ").trim();

  // Adjust offsets based on whitespace normalization
  // Since we build offsets during walk, we need to recalculate for the trimmed text
  const leadingSpaces = rawText.length - rawText.trimStart().length;
  const adjustedLinks: InlineLink[] = [];
  for (const link of links) {
    const start = link.start - leadingSpaces;
    const end = link.end - leadingSpaces;
    if (start >= 0 && end <= text.length && start < end) {
      const linkText = text.slice(start, end).trim();
      if (linkText) {
        adjustedLinks.push({ text: linkText, url: link.url, start, end });
      }
    }
  }

  return { text, links: adjustedLinks };
}

/**
 * Depth-first DOM walk emitting ContentBlock[] in document order.
 * Pure, synchronous, deterministic.
 */
export function extractContent(
  $: CheerioAPI,
  pageUrl: string
): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  function walk(node: AnyNode): void {
    const tag = getTagName(node);

    // Skip invisible tags
    if (SKIP_TAGS.has(tag)) return;
    if (isHidden($, node)) return;

    // Skip nav content (handled separately)
    if (tag === "nav" || ($(node).attr("role") === "navigation")) return;

    // Skip footer content (copyright noise)
    if (tag === "footer") return;

    // Skip interactive/widget elements — their text is UI controls, not content
    if (INTERACTIVE_TAGS.has(tag)) return;

    switch (tag) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const text = $(node).text().trim();
        if (!text) break;
        const level = parseInt(tag[1], 10) as 1 | 2 | 3 | 4 | 5 | 6;
        const id = $(node).attr("id") || undefined;
        blocks.push({ type: "heading", level, text, id });
        break;
      }

      case "p": {
        const { text, links } = extractTextWithLinks($, node, pageUrl);
        if (text && !isNoiseText(text)) {
          const block: ContentBlock = { type: "text", text };
          if (links.length > 0) (block as { links?: InlineLink[] }).links = links;
          blocks.push(block);
        }
        break;
      }

      case "blockquote": {
        const { text, links } = extractTextWithLinks($, node, pageUrl);
        if (!text) break;
        const cite = $(node).attr("cite") || undefined;
        const block: ContentBlock = { type: "quote", text, cite };
        if (links.length > 0) (block as { links?: InlineLink[] }).links = links;
        blocks.push(block);
        break;
      }

      case "pre": {
        const codeEl = $(node).find("code").first();
        const text = codeEl.length
          ? codeEl.text()
          : $(node).text();
        if (!text.trim()) break;
        let language: string | undefined;
        if (codeEl.length) {
          const cls = codeEl.attr("class") || "";
          const match = cls.match(/language-(\S+)/);
          if (match) language = match[1];
        }
        blocks.push({ type: "code", text, language });
        break;
      }

      case "img": {
        const src = $(node).attr("src")?.trim();
        if (!src || src.startsWith("data:")) break;
        const width = parseInt($(node).attr("width") || "", 10) || 0;
        const height = parseInt($(node).attr("height") || "", 10) || 0;
        if (width === 1 && height === 1) break;
        const resolved = resolveUrl(src, pageUrl);
        const alt = $(node).attr("alt")?.trim() || undefined;
        // Check for figcaption (if inside <figure>)
        let caption: string | undefined;
        const figure = $(node).closest("figure");
        if (figure.length) {
          caption = figure.find("figcaption").first().text().trim() || undefined;
        }
        blocks.push({ type: "media", kind: "image", src: resolved, alt, caption });
        break;
      }

      case "video": {
        let src = $(node).attr("src")?.trim();
        if (!src) {
          src = $(node).find("source").first().attr("src")?.trim();
        }
        if (src) {
          blocks.push({
            type: "media",
            kind: "video",
            src: resolveUrl(src, pageUrl),
            alt: $(node).attr("alt")?.trim() || undefined,
          });
        }
        break;
      }

      case "audio": {
        let src = $(node).attr("src")?.trim();
        if (!src) {
          src = $(node).find("source").first().attr("src")?.trim();
        }
        if (src) {
          blocks.push({
            type: "media",
            kind: "audio",
            src: resolveUrl(src, pageUrl),
            alt: $(node).attr("alt")?.trim() || undefined,
          });
        }
        break;
      }

      case "ul":
      case "ol": {
        // Skip lists inside nav
        if (isInsideNav($, node)) break;
        // Skip nested lists (only process top-level)
        if ($(node).parent().closest("ul, ol, dl").length > 0) break;
        const items: string[] = [];
        const itemLinks: InlineLink[][] = [];
        let hasAnyLinks = false;
        $(node).children("li").each((_, li) => {
          const { text, links } = extractTextWithLinks($, li as unknown as AnyNode, pageUrl);
          if (text) {
            items.push(text);
            itemLinks.push(links);
            if (links.length > 0) hasAnyLinks = true;
          }
        });
        if (items.length > 0) {
          const block: ContentBlock = { type: "list", ordered: tag === "ol", items };
          if (hasAnyLinks) (block as { item_links?: InlineLink[][] }).item_links = itemLinks;
          blocks.push(block);
        }
        break;
      }

      case "dl": {
        if (isInsideNav($, node)) break;
        if ($(node).parent().closest("ul, ol, dl").length > 0) break;
        const items: string[] = [];
        $(node).find("dt").each((_, dt) => {
          const term = $(dt).text().trim();
          const dd = $(dt).next("dd");
          const def = dd.length ? dd.text().trim() : "";
          items.push(def ? `${term}: ${def}` : term);
        });
        if (items.length > 0) {
          blocks.push({ type: "list", ordered: false, items });
        }
        break;
      }

      case "table": {
        const tableEl = $(node);
        const headers: string[] = [];
        const headerRow = tableEl.find("thead tr").first();
        if (headerRow.length) {
          headerRow.find("th, td").each((_, cell) => {
            headers.push($(cell).text().trim());
          });
        }

        const rows: string[][] = [];
        const bodyRows = tableEl.find("tbody tr");
        const targetRows = bodyRows.length ? bodyRows : tableEl.find("tr");
        targetRows.each((i, row) => {
          if (!headerRow.length && i === 0 && headers.length === 0) {
            const cells: string[] = [];
            $(row).find("th, td").each((_, cell) => {
              cells.push($(cell).text().trim());
            });
            if ($(row).find("th").length > 0) {
              headers.push(...cells);
              return;
            }
            rows.push(cells);
            return;
          }
          const cells: string[] = [];
          $(row).find("td, th").each((_, cell) => {
            cells.push($(cell).text().trim());
          });
          if (cells.length > 0) rows.push(cells);
        });

        if (headers.length > 0 || rows.length > 0) {
          blocks.push({
            type: "table",
            headers: headers.length > 0 ? headers : undefined,
            rows,
          });
        }
        break;
      }

      case "iframe":
      case "object":
      case "embed": {
        const src = $(node).attr("src")?.trim();
        if (src) {
          blocks.push({
            type: "embedded",
            kind: tag as "iframe" | "object" | "embed",
            src: resolveUrl(src, pageUrl),
            title: $(node).attr("title")?.trim() || undefined,
          });
        }
        break;
      }

      default: {
        // Inline tags at top level — only emit if they're standalone direct text
        if (INLINE_TAGS.has(tag)) {
          // Inline elements are captured by their parent's extractTextWithLinks.
          // Only emit standalone inline elements that are direct children of body-level containers.
          break;
        }

        // figure — walk children (img/figcaption handled by img case)
        if (tag === "figure") {
          const children = $(node).contents();
          children.each((_, child) => {
            if (child.type === "tag") walk(child);
          });
          break;
        }

        // Everything else (div, section, article, custom elements, web components, etc.)
        // — treat as a container and recurse into children
        const children = $(node).contents();
        children.each((_, child) => {
          if (child.type === "text") {
            const text = $(child).text().trim();
            if (text && !isNoiseText(text)) blocks.push({ type: "text", text });
          } else if (child.type === "tag") {
            // Skip microdata leaf values (e.g. <span itemprop="price">2299</span>)
            if ($(child).attr("itemprop") && $(child).children().length === 0) return;
            walk(child);
          }
        });
        break;
      }
    }
  }

  // Start walk from body
  const body = $("body");
  if (body.length) {
    body.contents().each((_, child) => {
      if (child.type === "tag") {
        walk(child);
      } else if (child.type === "text") {
        const text = $(child).text().trim();
        if (text && !isNoiseText(text)) blocks.push({ type: "text", text });
      }
    });
  }

  return blocks;
}
