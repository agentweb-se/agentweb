import * as cheerio from "cheerio";

export function parseJsonLd(html: string): unknown[] {
  const $ = cheerio.load(html);
  const blocks: unknown[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html();
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);

      // Handle @graph arrays
      if (parsed["@graph"] && Array.isArray(parsed["@graph"])) {
        for (const item of parsed["@graph"]) {
          if (item && typeof item === "object") {
            blocks.push(item);
          }
        }
      } else if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === "object") {
            blocks.push(item);
          }
        }
      } else if (typeof parsed === "object") {
        blocks.push(parsed);
      }
    } catch {
      // Malformed JSON-LD — skip silently
    }
  });

  return blocks;
}
