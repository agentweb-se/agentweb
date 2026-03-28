import { z } from "zod";
import { CapabilityType } from "../schema/universal";

// --- Site Identity ---

export const SiteIdentity = z.object({
  name: z.string(),
  domain: z.string(),
  language: z.string(), // ISO 639-1 ("sv", "en", "de", etc.)
  type: z.string(), // freeform: "e-commerce", "saas", "corporate", etc.
  description: z.string(), // 1-3 sentences
});
export type SiteIdentity = z.infer<typeof SiteIdentity>;

// --- Instructions ---

export const GeneralInstructions = z.object({
  language_note: z.string(),
  tips: z.array(z.string()),
  behavior: z.array(z.string()).optional(), // behavioral rules for consuming agents
});
export type GeneralInstructions = z.infer<typeof GeneralInstructions>;

export const SearchInstructions = z.object({
  how: z.string(), // "GET https://example.com/search?q={query}"
  tips: z.array(z.string()),
  response_format: z.string().optional(), // "JSON array of products with name, price, url fields"
  fallback: z.string().optional(),
});
export type SearchInstructions = z.infer<typeof SearchInstructions>;

export const BrowseInstructions = z.object({
  how: z.string(),
  when_to_use: z.string(),
  navigation_tip: z.string().optional(),
  categories: z.array(
    z.object({
      name: z.string(),
      url: z.string().refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
        message: "Category URL must start with http:// or https://",
      }),
      contains: z.string(),
    })
  ),
  tips: z.array(z.string()),
});
export type BrowseInstructions = z.infer<typeof BrowseInstructions>;

export const ContentInstructions = z.object({
  what_you_find: z.string(),
  price_format: z.string().optional(),
  url_pattern: z.string().optional(),
  availability: z.string().optional(),
});
export type ContentInstructions = z.infer<typeof ContentInstructions>;

export const ContactInstructions = z.object({
  how: z.string(),
  methods: z.array(z.string()),
});
export type ContactInstructions = z.infer<typeof ContactInstructions>;

export const PolicyEntry = z.object({
  topic: z.string(),                    // "shipping", "returns", "payment_methods", etc.
  summary: z.string(),                  // 1-3 sentences with real data
  details: z.array(z.string()),         // Bullet points: actual numbers, conditions, timeframes
  source_url: z.string().optional(),    // URL where found
});
export type PolicyEntry = z.infer<typeof PolicyEntry>;

export const PoliciesInstructions = z.object({
  site_type: z.string(),               // Echo back detected site type for context
  policies: z.array(PolicyEntry),
});
export type PoliciesInstructions = z.infer<typeof PoliciesInstructions>;

export const FormsInstructions = z.object({
  how: z.string(), // "Add filter params to the search API endpoint"
  filters: z.array(z.object({
    name: z.string(),      // "brand", "price_min", "sort"
    type: z.string(),      // "select", "range", "boolean"
    param: z.string(),     // The actual URL param or body field name
    values: z.array(z.unknown().transform(v => String(v))).optional(), // Known values: ["Samsung", "Apple", "Sony"]
    description: z.string().optional(),
  })),
  endpoint: z.object({
    url: z.string(),
    method: z.string(),
    note: z.string().optional(), // "Same endpoint as search, filters are additional params"
  }).optional(),
  tips: z.array(z.string()),
});
export type FormsInstructions = z.infer<typeof FormsInstructions>;

export const SiteInstructions = z
  .object({
    general: GeneralInstructions.optional(),
    search: SearchInstructions.optional(),
    browse: BrowseInstructions.optional(),
    forms: FormsInstructions.optional(),
    product_pages: ContentInstructions.optional(),
    contact: ContactInstructions.optional(),
    policies: PoliciesInstructions.optional(),
  })
  .passthrough(); // agent can add site-specific sections

export type SiteInstructions = z.infer<typeof SiteInstructions>;

// --- Presentation ---

export const PresentationRules = z.object({
  rules: z.array(z.string()),
  currency: z.string().optional(),
  language_note: z.string().optional(),
});
export type PresentationRules = z.infer<typeof PresentationRules>;

// --- Pages ---

export const KeyPage = z.object({
  url: z.string(),
  description: z.string(),
});
export type KeyPage = z.infer<typeof KeyPage>;

export const PageMap = z.object({
  key_pages: z.array(KeyPage),
  total_explored: z.number().int(),
  page_types: z.record(z.string(), z.string()),
});
export type PageMap = z.infer<typeof PageMap>;

// --- Capabilities ---

export const CapabilityStatus = z.enum(["found", "verified", "not_found"]);
export type CapabilityStatus = z.infer<typeof CapabilityStatus>;

export const CapabilityEndpoint = z.object({
  url: z.string(),
  method: z.string(),
  params: z.array(z.string()).optional(),
});
export type CapabilityEndpoint = z.infer<typeof CapabilityEndpoint>;

export const CapabilityEntry = z.object({
  status: CapabilityStatus,
  details: z.string().optional(),
  endpoint: CapabilityEndpoint.optional(),
  priority: z.enum(["power", "default", "fallback"]).optional(),
});
export type CapabilityEntry = z.infer<typeof CapabilityEntry>;

// All 10 capability types required — agent must report on every one
const capabilityKeys = CapabilityType.options;
const capabilitiesShape: Record<string, z.ZodType<CapabilityEntry>> = {};
for (const key of capabilityKeys) {
  capabilitiesShape[key] = CapabilityEntry;
}
export const CapabilitiesMap = z.object(
  capabilitiesShape as Record<
    z.infer<typeof CapabilityType>,
    typeof CapabilityEntry
  >
);
export type CapabilitiesMap = z.infer<typeof CapabilitiesMap>;

// --- Top-level agents.json ---

export const AgentsJson = z
  .object({
    version: z.string(),
    generated_at: z.string(),
    generator: z.string(),
    site: SiteIdentity,
    instructions: SiteInstructions,
    presentation: PresentationRules,
    pages: PageMap,
    capabilities: CapabilitiesMap,
  })
  .strict(); // reject unknown top-level fields

export type AgentsJson = z.infer<typeof AgentsJson>;

// --- Blank template ---

export function blankAgentsJsonTemplate(): AgentsJson {
  const capabilities: Record<string, CapabilityEntry> = {};
  for (const key of capabilityKeys) {
    capabilities[key] = { status: "not_found" };
  }

  return {
    version: "1.0",
    generated_at: new Date().toISOString(),
    generator: "agentweb.io",
    site: {
      name: "",
      domain: "",
      language: "",
      type: "",
      description: "",
    },
    instructions: {},
    presentation: {
      rules: [],
    },
    pages: {
      key_pages: [],
      total_explored: 0,
      page_types: {},
    },
    capabilities: capabilities as CapabilitiesMap,
  };
}
