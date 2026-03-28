import * as cheerio from "cheerio";
import type { CrawlPage } from "../crawl/types";
import type { Page, PageMeta } from "../schema";
import { extractContent } from "./content";
import { buildSections } from "./sections";
import { extractActions } from "./actions";
import { hashContent } from "./hash";
import { parseMetadata } from "./parsers/metadata";
import { parseJsonLd } from "./parsers/json-ld";

export function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

export type PageExtractionDependencies = {
  loadHtml: (html: string) => cheerio.CheerioAPI;
  parseMetadata: typeof parseMetadata;
  parseJsonLd: typeof parseJsonLd;
  extractContent: typeof extractContent;
  buildSections: typeof buildSections;
  extractActions: typeof extractActions;
  hashContent: typeof hashContent;
  decodeTitle: (text: string) => string;
};

function resolveDependencies(overrides?: Partial<PageExtractionDependencies>): PageExtractionDependencies {
  return {
    loadHtml: overrides?.loadHtml ?? cheerio.load,
    parseMetadata: overrides?.parseMetadata ?? parseMetadata,
    parseJsonLd: overrides?.parseJsonLd ?? parseJsonLd,
    extractContent: overrides?.extractContent ?? extractContent,
    buildSections: overrides?.buildSections ?? buildSections,
    extractActions: overrides?.extractActions ?? extractActions,
    hashContent: overrides?.hashContent ?? hashContent,
    decodeTitle: overrides?.decodeTitle ?? decodeEntities,
  };
}

export function extractPage(
  crawlPage: CrawlPage,
  deps?: Partial<PageExtractionDependencies>
): Page {
  const d = resolveDependencies(deps);
  const $ = d.loadHtml(crawlPage.html);

  const { title: parsedTitle, meta } = d.parseMetadata(crawlPage.html);
  const jsonLd = d.parseJsonLd(crawlPage.html);
  const pageMeta: PageMeta = {
    ...meta,
    json_ld: jsonLd.length > 0 ? jsonLd : undefined,
  };

  const contentBlocks = d.extractContent($, crawlPage.url);
  const sections = d.buildSections(contentBlocks);

  const allActions = d.extractActions($, crawlPage.url);
  const actions = allActions.filter((a) => a.context !== "nav");

  const content_hash = d.hashContent({ sections, actions });

  const rawTitle = crawlPage.title || parsedTitle;
  const title = rawTitle ? d.decodeTitle(rawTitle) : undefined;

  return {
    url: crawlPage.url,
    title,
    meta: pageMeta,
    sections,
    actions,
    content_hash,
  };
}
