import { z } from "zod";

// --- Inline Links ---

export const InlineLink = z.object({
  text: z.string(),
  url: z.string(),
  start: z.number().int(),
  end: z.number().int(),
});
export type InlineLink = z.infer<typeof InlineLink>;

// --- Content Blocks ---

const TextBlock = z.object({
  type: z.literal("text"),
  text: z.string(),
  links: z.array(InlineLink).optional(),
});

const HeadingBlock = z.object({
  type: z.literal("heading"),
  level: z.number().int().min(1).max(6),
  text: z.string(),
  id: z.string().optional(),
});

const MediaBlock = z.object({
  type: z.literal("media"),
  kind: z.enum(["image", "video", "audio"]),
  src: z.string(),
  alt: z.string().optional(),
  caption: z.string().optional(),
});

const ListBlock = z.object({
  type: z.literal("list"),
  ordered: z.boolean(),
  items: z.array(z.string()),
  item_links: z.array(z.array(InlineLink)).optional(),
});

const TableBlock = z.object({
  type: z.literal("table"),
  headers: z.array(z.string()).optional(),
  rows: z.array(z.array(z.string())),
});

const EmbeddedBlock = z.object({
  type: z.literal("embedded"),
  kind: z.enum(["iframe", "object", "embed"]),
  src: z.string(),
  title: z.string().optional(),
});

const CodeBlock = z.object({
  type: z.literal("code"),
  language: z.string().optional(),
  text: z.string(),
});

const QuoteBlock = z.object({
  type: z.literal("quote"),
  text: z.string(),
  cite: z.string().optional(),
  links: z.array(InlineLink).optional(),
});

export const ContentBlock = z.discriminatedUnion("type", [
  TextBlock,
  HeadingBlock,
  MediaBlock,
  ListBlock,
  TableBlock,
  EmbeddedBlock,
  CodeBlock,
  QuoteBlock,
]);
export type ContentBlock = z.infer<typeof ContentBlock>;

// --- Actions ---

export const ActionContext = z.enum(["nav", "main", "footer"]);
export type ActionContext = z.infer<typeof ActionContext>;

export const FormField = z.object({
  name: z.string(),
  type: z.string(),
  label: z.string().optional(),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
});
export type FormField = z.infer<typeof FormField>;

export const CapabilityType = z.enum([
  "navigation",
  "search",
  "forms",
  "content_pages",
  // TODO: agent not yet implemented
  // "downloads",
  // "location",
  // "media_feeds",
]);
export type CapabilityType = z.infer<typeof CapabilityType>;

export const ResolvedApiParam = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().optional(),
});

export const VerificationStatus = z.enum(["verified", "observed"]);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

export const ResolvedApi = z.object({
  url: z.string(),
  method: z.string(),
  params: z.array(ResolvedApiParam).optional(),
  request_body_shape: z.string().optional(),
  response_content_type: z.string(),
  response_shape: z.string().optional(),
  capability: CapabilityType.optional(),
  verification_status: VerificationStatus,
});
export type ResolvedApi = z.infer<typeof ResolvedApi>;

const NavigateAction = z.object({
  type: z.literal("navigate"),
  label: z.string(),
  url: z.string(),
  internal: z.boolean(),
  context: ActionContext.optional(),
  resolved_api: ResolvedApi.optional(),
});

const SubmitAction = z.object({
  type: z.literal("submit"),
  label: z.string(),
  url: z.string(),
  method: z.string(),
  fields: z.array(FormField),
  context: ActionContext.optional(),
  resolved_api: ResolvedApi.optional(),
});

const DownloadAction = z.object({
  type: z.literal("download"),
  label: z.string(),
  url: z.string(),
  filename: z.string().optional(),
  filetype: z.string().optional(),
  context: ActionContext.optional(),
  resolved_api: ResolvedApi.optional(),
});

export const Action = z.discriminatedUnion("type", [
  NavigateAction,
  SubmitAction,
  DownloadAction,
]);
export type Action = z.infer<typeof Action>;

// --- Section Tree ---

export type Section = {
  heading?: { level: number; text: string; id?: string };
  content: ContentBlock[];
  subsections: Section[];
};

export const Section: z.ZodType<Section> = z.lazy(() =>
  z.object({
    heading: z
      .object({
        level: z.number().int().min(1).max(6),
        text: z.string(),
        id: z.string().optional(),
      })
      .optional(),
    content: z.array(ContentBlock),
    subsections: z.array(Section),
  })
);

// --- Page Meta ---

export const PageMeta = z.object({
  description: z.string().optional(),
  og: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      image: z.string().optional(),
      type: z.string().optional(),
      url: z.string().optional(),
      site_name: z.string().optional(),
    })
    .optional(),
  twitter: z
    .object({
      card: z.string().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      image: z.string().optional(),
      site: z.string().optional(),
    })
    .optional(),
  json_ld: z.array(z.unknown()).optional(),
  canonical: z.string().optional(),
});
export type PageMeta = z.infer<typeof PageMeta>;

// --- Page ---

export const Page = z.object({
  url: z.string(),
  title: z.string().optional(),
  meta: PageMeta,
  sections: z.array(Section),
  actions: z.array(Action),
  content_hash: z.string(),
});
export type Page = z.infer<typeof Page>;

// --- Navigation ---

export type NavigationItem = {
  label: string;
  url?: string;
  children?: NavigationItem[];
};

export const NavigationItem: z.ZodType<NavigationItem> = z.lazy(() =>
  z.object({
    label: z.string(),
    url: z.string().optional(),
    children: z.array(NavigationItem).optional(),
  })
);

// --- Capabilities ---

export const CapabilityEvidence = z.object({
  kind: z.string(),
  page_slug: z.string(),
  detail: z.string().optional(),
});
export type CapabilityEvidence = z.infer<typeof CapabilityEvidence>;

export const SiteCapability = z.object({
  type: CapabilityType,
  confidence: z.enum(["high", "medium"]),
  evidence: z.array(CapabilityEvidence),
  entry_points: z.array(z.string()),
});
export type SiteCapability = z.infer<typeof SiteCapability>;

// --- Site ---

export const CrawlModeField = z.enum(["full", "discovery"]);
export type CrawlModeField = z.infer<typeof CrawlModeField>;

export const Site = z.object({
  url: z.string(),
  crawled_at: z.string(),
  page_count: z.number().int(),
  site_meta: PageMeta,
  navigation: z.array(NavigationItem),
  pages: z.array(Page),
  content_hash: z.string(),
  capabilities: z.array(SiteCapability).optional(),
  crawl_mode: CrawlModeField.optional(),
  estimated_total_pages: z.number().int().optional(),
});
export type Site = z.infer<typeof Site>;
