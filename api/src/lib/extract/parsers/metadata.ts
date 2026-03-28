import * as cheerio from "cheerio";
import type { PageMeta } from "../../schema";

export function parseMetadata(html: string): { title?: string; meta: PageMeta } {
  const $ = cheerio.load(html);

  const getMeta = (selector: string): string | undefined => {
    const el = $(selector).first();
    return el.attr("content")?.trim() || undefined;
  };

  const title = $("title").first().text().trim() || undefined;
  const description =
    getMeta('meta[name="description"]') ||
    getMeta('meta[property="description"]') ||
    undefined;
  const canonical =
    $('link[rel="canonical"]').first().attr("href")?.trim() || undefined;

  // Open Graph
  const ogTitle = getMeta('meta[property="og:title"]');
  const ogDesc = getMeta('meta[property="og:description"]');
  const ogImage = getMeta('meta[property="og:image"]');
  const ogType = getMeta('meta[property="og:type"]');
  const ogUrl = getMeta('meta[property="og:url"]');
  const ogSiteName = getMeta('meta[property="og:site_name"]');

  const og =
    ogTitle || ogDesc || ogImage || ogType || ogUrl || ogSiteName
      ? {
          title: ogTitle,
          description: ogDesc,
          image: ogImage,
          type: ogType,
          url: ogUrl,
          site_name: ogSiteName,
        }
      : undefined;

  // Twitter Card
  const twCard =
    getMeta('meta[name="twitter:card"]') ||
    getMeta('meta[property="twitter:card"]');
  const twTitle =
    getMeta('meta[name="twitter:title"]') ||
    getMeta('meta[property="twitter:title"]');
  const twDesc =
    getMeta('meta[name="twitter:description"]') ||
    getMeta('meta[property="twitter:description"]');
  const twImage =
    getMeta('meta[name="twitter:image"]') ||
    getMeta('meta[property="twitter:image"]');
  const twSite =
    getMeta('meta[name="twitter:site"]') ||
    getMeta('meta[property="twitter:site"]');

  const twitter =
    twCard || twTitle || twDesc || twImage || twSite
      ? {
          card: twCard,
          title: twTitle,
          description: twDesc,
          image: twImage,
          site: twSite,
        }
      : undefined;

  return {
    title,
    meta: { description, og, twitter, canonical },
  };
}
