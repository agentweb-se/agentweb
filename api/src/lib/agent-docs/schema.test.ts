import { describe, it, expect } from "vitest";
import { AgentsJson, blankAgentsJsonTemplate } from "./schema";

const EXAMPLE_AGENTS_JSON = {
  version: "1.0",
  generated_at: "2026-03-10T12:00:00Z",
  generator: "agentweb.io",
  site: {
    name: "Elgiganten",
    domain: "elgiganten.se",
    language: "sv",
    type: "e-commerce",
    description: "Sweden's largest electronics retailer.",
  },
  instructions: {
    general: {
      language_note: "Swedish site, search in Swedish",
      tips: ["Include product URLs"],
    },
    search: {
      how: "GET https://www.elgiganten.se/search?q={query}",
      tips: ["Search in Swedish", "Brand names work in English"],
      fallback: "Browse category pages",
    },
    browse: {
      how: "Navigate category hierarchy from main nav",
      when_to_use: "Use navigation to browse by category when exploring products",
      categories: [
        {
          name: "Datorer",
          url: "https://www.elgiganten.se/datorer-kontor",
          contains: "Laptops, desktops",
        },
      ],
      tips: ["Category pages have filters"],
    },
    product_pages: {
      what_you_find: "Price, availability, specs",
      price_format: "SEK",
      url_pattern: "/product/{slug}/{id}",
    },
    contact: {
      how: "Visit /kundservice",
      methods: ["Chat", "Phone: 0771-11 44 00"],
    },
  },
  presentation: {
    rules: ["Always include product URLs", "Show prices in SEK"],
    currency: "SEK",
    language_note: "Site is in Swedish.",
  },
  pages: {
    key_pages: [
      { url: "/", description: "Homepage with deals" },
      { url: "/datorer-kontor", description: "Computer category" },
    ],
    total_explored: 35,
    page_types: {
      product: "Individual product page",
      category: "Product listing with filters",
    },
  },
  capabilities: {
    navigation: { status: "found", details: "28 items in main nav" },
    search: {
      status: "verified",
      endpoint: {
        url: "https://www.elgiganten.se/search",
        method: "GET",
        params: ["q"],
      },
    },
    forms: { status: "found", details: "Contact form" },
    content_pages: { status: "found", details: "Terms, FAQ" },
  },
};

describe("AgentsJson schema", () => {
  it("parses the example agents.json", () => {
    const result = AgentsJson.safeParse(EXAMPLE_AGENTS_JSON);
    expect(result.success).toBe(true);
  });

  it("blank template passes validation", () => {
    const template = blankAgentsJsonTemplate();
    const result = AgentsJson.safeParse(template);
    expect(result.success).toBe(true);
  });

  it("rejects unknown top-level fields", () => {
    const bad = { ...EXAMPLE_AGENTS_JSON, extra_field: "nope" };
    const result = AgentsJson.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("requires all capability keys", () => {
    const missing = { ...EXAMPLE_AGENTS_JSON };
    const caps = { ...missing.capabilities };
    delete (caps as Record<string, unknown>)["content_pages"];
    missing.capabilities = caps;
    const result = AgentsJson.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it("allows extra instruction keys (passthrough)", () => {
    const extra = { ...EXAMPLE_AGENTS_JSON };
    extra.instructions = {
      ...extra.instructions,
      custom_section: { how: "Do something", tips: ["tip1"] },
    };
    const result = AgentsJson.safeParse(extra);
    expect(result.success).toBe(true);
  });

  it("blank template has all capabilities as not_found", () => {
    const template = blankAgentsJsonTemplate();
    const caps = template.capabilities;
    expect(Object.keys(caps)).toHaveLength(4);
    for (const entry of Object.values(caps)) {
      expect(entry.status).toBe("not_found");
    }
  });
});
