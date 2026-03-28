import { describe, it, expect } from "vitest";
import {
  assessManifestoQuality,
  assessSearchQuality,
  assessBrowseQuality,
  assessFormsQuality,
  assessContactQuality,
  assignCapabilityPriorities,
  getCapabilityStatus,
  autoFillBehavior,
  REQUIRED_BEHAVIOR_RULES,
  MAX_PHASE_RETRIES,
} from "./assessments";
import { blankAgentsJsonTemplate } from "./schema";

function makeDoc() {
  const doc = blankAgentsJsonTemplate();
  doc.site.domain = "example.com";
  return doc;
}

// ---------------------------------------------------------------------------
// assessManifestoQuality
// ---------------------------------------------------------------------------

describe("assessManifestoQuality", () => {
  it("passes when all fields present", () => {
    const doc = makeDoc();
    doc.site.name = "Example Store";
    doc.site.language = "en";
    doc.site.type = "e-commerce";
    doc.site.description = "An online store selling electronics and gadgets worldwide.";
    expect(assessManifestoQuality(doc)).toEqual([]);
  });

  it("fails when site.name is empty", () => {
    const doc = makeDoc();
    doc.site.name = "";
    doc.site.language = "en";
    doc.site.type = "e-commerce";
    doc.site.description = "A description that is definitely long enough.";
    const failures = assessManifestoQuality(doc);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures.some(f => f.includes("site.name"))).toBe(true);
  });

  it("fails when site.name is 'Unknown'", () => {
    const doc = makeDoc();
    doc.site.name = "Unknown";
    doc.site.language = "en";
    doc.site.type = "e-commerce";
    doc.site.description = "A description that is definitely long enough.";
    const failures = assessManifestoQuality(doc);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures.some(f => f.includes("site.name"))).toBe(true);
  });

  it("fails when site.language is empty", () => {
    const doc = makeDoc();
    doc.site.name = "Example Store";
    doc.site.language = "";
    doc.site.type = "e-commerce";
    doc.site.description = "A description that is definitely long enough.";
    const failures = assessManifestoQuality(doc);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures.some(f => f.includes("site.language"))).toBe(true);
  });

  it("fails when site.type is empty", () => {
    const doc = makeDoc();
    doc.site.name = "Example Store";
    doc.site.language = "en";
    doc.site.type = "";
    doc.site.description = "A description that is definitely long enough.";
    const failures = assessManifestoQuality(doc);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures.some(f => f.includes("site.type"))).toBe(true);
  });

  it("fails when site.description is empty", () => {
    const doc = makeDoc();
    doc.site.name = "Example Store";
    doc.site.language = "en";
    doc.site.type = "e-commerce";
    doc.site.description = "";
    const failures = assessManifestoQuality(doc);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures.some(f => f.includes("site.description"))).toBe(true);
  });

  it("fails when site.description is under 20 chars", () => {
    const doc = makeDoc();
    doc.site.name = "Example Store";
    doc.site.language = "en";
    doc.site.type = "e-commerce";
    doc.site.description = "Short description.."; // 19 chars
    expect(doc.site.description.length).toBe(19);
    const failures = assessManifestoQuality(doc);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures.some(f => f.includes("site.description"))).toBe(true);
  });

  it("returns multiple failures when multiple fields missing", () => {
    const doc = makeDoc();
    // All fields are empty by default from blankAgentsJsonTemplate
    const failures = assessManifestoQuality(doc);
    expect(failures.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// assessSearchQuality
// ---------------------------------------------------------------------------

describe("assessSearchQuality", () => {
  it("passes with verified status + instructions.search with URL in how", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).search = { status: "verified" };
    (doc.instructions as Record<string, unknown>).search = {
      how: "GET https://example.com/api/search?q={query}",
      response_format: "JSON array of products",
    };
    expect(assessSearchQuality(doc)).toEqual([]);
  });

  it("passes with not_found + details 20+ chars", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).search = {
      status: "not_found",
      details: "The site has no search functionality, only static pages with no API.",
    };
    expect(assessSearchQuality(doc)).toEqual([]);
  });

  it("fails when capabilities.search is missing", () => {
    const doc = makeDoc();
    delete (doc.capabilities as Record<string, unknown>).search;
    const failures = assessSearchQuality(doc);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures[0]).toContain("missing");
  });

  it("fails when status is 'found' (not verified/not_found)", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).search = { status: "found" };
    const failures = assessSearchQuality(doc);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures[0]).toContain("found");
  });

  it("fails when not_found but details too short", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).search = {
      status: "not_found",
      details: "No search.",
    };
    const failures = assessSearchQuality(doc);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures[0]).toContain("too short");
  });

  it("fails when verified but instructions.search missing", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).search = { status: "verified" };
    // instructions.search not set
    const failures = assessSearchQuality(doc);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures[0]).toContain("instructions.search");
  });

  it("fails when instructions.search.how has no URL", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).search = { status: "verified" };
    (doc.instructions as Record<string, unknown>).search = {
      how: "Use the search bar on the homepage to find products",
    };
    const failures = assessSearchQuality(doc);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures.some(f => f.includes("no URL"))).toBe(true);
  });

  it("fails when HTML search documented without evidence of trying JSON first", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).search = { status: "verified" };
    (doc.instructions as Record<string, unknown>).search = {
      how: "GET https://example.com/search?q={query}",
      response_format: "HTML page with search results",
    };
    const failures = assessSearchQuality(doc);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures.some(f => f.includes("tried to find the JSON API"))).toBe(true);
  });

  it("passes when HTML search documented with evidence that JSON API was tried", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).search = {
      status: "verified",
      details: "Algolia detected but Akamai bot protection blocked API discovery. HTML search returns real products.",
    };
    (doc.instructions as Record<string, unknown>).search = {
      how: "GET https://example.com/search?q={query} — returns HTML with server-rendered product listings",
      response_format: "html",
      tips: ["Search in Swedish"],
    };
    const failures = assessSearchQuality(doc);
    expect(failures).toHaveLength(0);
  });

  it("passes when HTML fallback documented with blocked API explanation", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).search = {
      status: "verified",
      details: "Bot detection blocked all JSON API calls. HTML search verified with 3 queries.",
    };
    (doc.instructions as Record<string, unknown>).search = {
      how: "GET https://example.com/search?q={query} returns html with products",
      response_format: "html",
      fallback: "JSON API was blocked by bot protection",
    };
    const failures = assessSearchQuality(doc);
    expect(failures).toHaveLength(0);
  });

  it("still passes JSON search without any fallback evidence needed", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).search = { status: "verified" };
    (doc.instructions as Record<string, unknown>).search = {
      how: "POST https://api.algolia.net/search — Headers: {...} — Body: {...}",
      response_format: "JSON array of products",
    };
    const failures = assessSearchQuality(doc);
    expect(failures).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// assessBrowseQuality
// ---------------------------------------------------------------------------

describe("assessBrowseQuality", () => {
  function makeValidBrowseDoc() {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).navigation = { status: "verified" };
    (doc.instructions as Record<string, unknown>).browse = {
      how: "Navigate by visiting category pages from the main menu.",
      when_to_use: "When the user wants to browse products by category.",
      categories: [
        { name: "Electronics", url: "https://example.com/electronics", contains: "Phones, laptops, etc." },
        { name: "Clothing", url: "https://example.com/clothing", contains: "Shirts, pants, jackets." },
        { name: "Home & Garden", url: "https://example.com/home", contains: "Furniture, tools, decor." },
      ],
    };
    return doc;
  }

  it("passes with verified + browse instructions with 3+ on-domain categories", () => {
    const doc = makeValidBrowseDoc();
    expect(assessBrowseQuality(doc, "example.com")).toEqual([]);
  });

  it("passes with not_found + 20+ char details", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).navigation = {
      status: "not_found",
      details: "This site is a single-page app with no category navigation at all.",
    };
    expect(assessBrowseQuality(doc, "example.com")).toEqual([]);
  });

  it("fails when navigation status missing", () => {
    const doc = makeDoc();
    delete (doc.capabilities as Record<string, unknown>).navigation;
    const failures = assessBrowseQuality(doc, "example.com");
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures[0]).toContain("missing");
  });

  it("fails when status is 'found'", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).navigation = { status: "found" };
    const failures = assessBrowseQuality(doc, "example.com");
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures[0]).toContain("found");
  });

  it("fails when not_found but details too short", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).navigation = {
      status: "not_found",
      details: "No nav.",
    };
    const failures = assessBrowseQuality(doc, "example.com");
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures[0]).toContain("too short");
  });

  it("fails when instructions.browse missing", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).navigation = { status: "verified" };
    // instructions.browse not set
    const failures = assessBrowseQuality(doc, "example.com");
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures[0]).toContain("instructions.browse");
  });

  it("fails when browse.how is empty", () => {
    const doc = makeValidBrowseDoc();
    (doc.instructions as Record<string, { how: string }>).browse.how = "";
    const failures = assessBrowseQuality(doc, "example.com");
    expect(failures.some(f => f.includes("how is empty"))).toBe(true);
  });

  it("fails when browse.when_to_use is empty", () => {
    const doc = makeValidBrowseDoc();
    (doc.instructions as Record<string, { when_to_use: string }>).browse.when_to_use = "";
    const failures = assessBrowseQuality(doc, "example.com");
    expect(failures.some(f => f.includes("when_to_use is empty"))).toBe(true);
  });

  it("fails when categories < 3", () => {
    const doc = makeValidBrowseDoc();
    const browse = (doc.instructions as Record<string, { categories: unknown[] }>).browse;
    browse.categories = [
      { name: "Electronics", url: "https://example.com/electronics", contains: "Phones." },
    ];
    const failures = assessBrowseQuality(doc, "example.com");
    expect(failures.some(f => f.includes("at least 3"))).toBe(true);
  });

  it("fails when category missing name", () => {
    const doc = makeValidBrowseDoc();
    const browse = (doc.instructions as Record<string, { categories: Array<{ name?: string; url: string; contains: string }> }>).browse;
    browse.categories = [
      { name: "", url: "https://example.com/a", contains: "stuff" },
      { name: "B", url: "https://example.com/b", contains: "stuff" },
      { name: "C", url: "https://example.com/c", contains: "stuff" },
    ];
    const failures = assessBrowseQuality(doc, "example.com");
    expect(failures.some(f => f.includes("missing name"))).toBe(true);
  });

  it("fails when category URL on wrong domain", () => {
    const doc = makeValidBrowseDoc();
    const browse = (doc.instructions as Record<string, { categories: Array<{ name: string; url: string; contains: string }> }>).browse;
    browse.categories = [
      { name: "A", url: "https://other-site.com/a", contains: "stuff" },
      { name: "B", url: "https://example.com/b", contains: "stuff" },
      { name: "C", url: "https://example.com/c", contains: "stuff" },
    ];
    const failures = assessBrowseQuality(doc, "example.com");
    expect(failures.some(f => f.includes("other-site.com"))).toBe(true);
  });

  it("fails when category missing contains", () => {
    const doc = makeValidBrowseDoc();
    const browse = (doc.instructions as Record<string, { categories: Array<{ name: string; url: string; contains?: string }> }>).browse;
    browse.categories = [
      { name: "A", url: "https://example.com/a", contains: "" },
      { name: "B", url: "https://example.com/b", contains: "stuff" },
      { name: "C", url: "https://example.com/c", contains: "stuff" },
    ];
    const failures = assessBrowseQuality(doc, "example.com");
    expect(failures.some(f => f.includes("missing contains"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// assessFormsQuality
// ---------------------------------------------------------------------------

describe("assessFormsQuality", () => {
  function makeValidFormsDoc() {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).forms = { status: "verified" };
    (doc.instructions as Record<string, unknown>).forms = {
      how: "Append filter parameters to the JSON API endpoint to narrow results.",
      filters: [
        { name: "brand", param: "brand", type: "select" },
        { name: "price_min", param: "price_min", type: "range" },
      ],
    };
    return doc;
  }

  it("passes with verified + 2+ filters with name and param", () => {
    const doc = makeValidFormsDoc();
    expect(assessFormsQuality(doc)).toEqual([]);
  });

  it("passes with not_found + 20+ char details", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).forms = {
      status: "not_found",
      details: "No filter or sorting functionality was found on any listing pages.",
    };
    expect(assessFormsQuality(doc)).toEqual([]);
  });

  it("fails when forms status missing", () => {
    const doc = makeDoc();
    delete (doc.capabilities as Record<string, unknown>).forms;
    const failures = assessFormsQuality(doc);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures[0]).toContain("missing");
  });

  it("fails when not_found but details too short", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).forms = {
      status: "not_found",
      details: "No filters.",
    };
    const failures = assessFormsQuality(doc);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures[0]).toContain("too short");
  });

  it("fails when instructions.forms missing", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).forms = { status: "verified" };
    // instructions.forms not set
    const failures = assessFormsQuality(doc);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures[0]).toContain("instructions.forms");
  });

  it("fails when forms.how is empty", () => {
    const doc = makeValidFormsDoc();
    (doc.instructions as Record<string, { how: string }>).forms.how = "";
    const failures = assessFormsQuality(doc);
    expect(failures.some(f => f.includes("how is empty"))).toBe(true);
  });

  it("fails when filters < 2", () => {
    const doc = makeValidFormsDoc();
    const forms = (doc.instructions as Record<string, { filters: unknown[] }>).forms;
    forms.filters = [{ name: "brand", param: "brand", type: "select" }];
    const failures = assessFormsQuality(doc);
    expect(failures.some(f => f.includes("at least 2"))).toBe(true);
  });

  it("fails when filter missing name", () => {
    const doc = makeValidFormsDoc();
    const forms = (doc.instructions as Record<string, { filters: Array<{ name?: string; param: string }> }>).forms;
    forms.filters = [
      { name: "", param: "brand" },
      { name: "price", param: "price_min" },
    ];
    const failures = assessFormsQuality(doc);
    expect(failures.some(f => f.includes("missing name"))).toBe(true);
  });

  it("fails when filter missing param", () => {
    const doc = makeValidFormsDoc();
    const forms = (doc.instructions as Record<string, { filters: Array<{ name: string; param?: string }> }>).forms;
    forms.filters = [
      { name: "brand", param: "" },
      { name: "price", param: "price_min" },
    ];
    const failures = assessFormsQuality(doc);
    expect(failures.some(f => f.includes("missing param"))).toBe(true);
  });

  it("fails when how references HTML without JSON", () => {
    const doc = makeValidFormsDoc();
    (doc.instructions as Record<string, { how: string }>).forms.how =
      "Submit the HTML form on the page to filter results.";
    const failures = assessFormsQuality(doc);
    expect(failures.some(f => f.includes("HTML"))).toBe(true);
  });

  it("fails when endpoint URL matches unsafe pattern (/contact)", () => {
    const doc = makeValidFormsDoc();
    const forms = (doc.instructions as Record<string, { endpoint?: { url: string; method: string } }>).forms;
    forms.endpoint = { url: "https://example.com/contact", method: "POST" };
    const failures = assessFormsQuality(doc);
    expect(failures.some(f => f.includes("SAFETY"))).toBe(true);
    expect(failures.some(f => f.includes("/contact"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// assessContactQuality
// ---------------------------------------------------------------------------

describe("assessContactQuality", () => {
  it("passes with how + methods containing phone number", () => {
    const doc = makeDoc();
    doc.site.type = "blog";
    (doc.instructions as Record<string, unknown>).contact = {
      how: "Call the support hotline during business hours.",
      methods: ["Phone: +46 8 123 4567"],
    };
    (doc.instructions as Record<string, unknown>).policies = {
      site_type: "blog",
      policies: [],
    };
    expect(assessContactQuality(doc)).toEqual([]);
  });

  it("passes with methods containing email", () => {
    const doc = makeDoc();
    doc.site.type = "blog";
    (doc.instructions as Record<string, unknown>).contact = {
      how: "Email the support team for any questions.",
      methods: ["Email: support@example.com"],
    };
    (doc.instructions as Record<string, unknown>).policies = {
      site_type: "blog",
      policies: [],
    };
    expect(assessContactQuality(doc)).toEqual([]);
  });

  it("passes with methods containing URL", () => {
    const doc = makeDoc();
    doc.site.type = "blog";
    (doc.instructions as Record<string, unknown>).contact = {
      how: "Use the contact form to reach support.",
      methods: ["Contact form: https://example.com/contact"],
    };
    (doc.instructions as Record<string, unknown>).policies = {
      site_type: "blog",
      policies: [],
    };
    expect(assessContactQuality(doc)).toEqual([]);
  });

  it("fails when instructions.contact missing", () => {
    const doc = makeDoc();
    const failures = assessContactQuality(doc);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures[0]).toContain("instructions.contact");
  });

  it("fails when contact.how is empty", () => {
    const doc = makeDoc();
    doc.site.type = "blog";
    (doc.instructions as Record<string, unknown>).contact = {
      how: "",
      methods: ["Phone: +46 8 123 4567"],
    };
    (doc.instructions as Record<string, unknown>).policies = {
      site_type: "blog",
      policies: [],
    };
    const failures = assessContactQuality(doc);
    expect(failures.some(f => f.includes("how is empty"))).toBe(true);
  });

  it("fails when methods array is empty", () => {
    const doc = makeDoc();
    doc.site.type = "blog";
    (doc.instructions as Record<string, unknown>).contact = {
      how: "Contact support for help.",
      methods: [],
    };
    const failures = assessContactQuality(doc);
    expect(failures.some(f => f.includes("methods is empty"))).toBe(true);
  });

  it("fails when no method has real data (only placeholders)", () => {
    const doc = makeDoc();
    doc.site.type = "blog";
    (doc.instructions as Record<string, unknown>).contact = {
      how: "Contact support for help.",
      methods: ["Call us", "Email support"],
    };
    (doc.instructions as Record<string, unknown>).policies = {
      site_type: "blog",
      policies: [],
    };
    const failures = assessContactQuality(doc);
    expect(failures.some(f => f.includes("real data"))).toBe(true);
  });

  it("fails for e-commerce site without policies", () => {
    const doc = makeDoc();
    doc.site.type = "e-commerce";
    (doc.instructions as Record<string, unknown>).contact = {
      how: "Call support for order issues.",
      methods: ["Phone: +46 8 123 4567"],
    };
    // No policies set
    const failures = assessContactQuality(doc);
    expect(failures.some(f => f.includes("e-commerce") || f.includes("policies"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// assignCapabilityPriorities
// ---------------------------------------------------------------------------

describe("assignCapabilityPriorities", () => {
  it("sets search to 'power' when verified", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).search = { status: "verified" };
    assignCapabilityPriorities(doc, true, false, false);
    const caps = doc.capabilities as Record<string, { priority?: string }>;
    expect(caps.search.priority).toBe("power");
  });

  it("sets navigation to 'default' when both search and browse verified", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).search = { status: "verified" };
    (doc.capabilities as Record<string, unknown>).navigation = { status: "verified" };
    assignCapabilityPriorities(doc, true, true, false);
    const caps = doc.capabilities as Record<string, { priority?: string }>;
    expect(caps.navigation.priority).toBe("default");
  });

  it("sets navigation to 'power' when browse verified but not search", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).search = { status: "not_found" };
    (doc.capabilities as Record<string, unknown>).navigation = { status: "verified" };
    assignCapabilityPriorities(doc, false, true, false);
    const caps = doc.capabilities as Record<string, { priority?: string }>;
    expect(caps.navigation.priority).toBe("power");
  });

  it("sets forms to 'default' when both forms and search verified", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).search = { status: "verified" };
    (doc.capabilities as Record<string, unknown>).forms = { status: "verified" };
    assignCapabilityPriorities(doc, true, false, true);
    const caps = doc.capabilities as Record<string, { priority?: string }>;
    expect(caps.forms.priority).toBe("default");
  });

  it("deletes priority when not verified", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).search = { status: "not_found", priority: "power" };
    (doc.capabilities as Record<string, unknown>).navigation = { status: "not_found", priority: "default" };
    (doc.capabilities as Record<string, unknown>).forms = { status: "not_found", priority: "default" };
    assignCapabilityPriorities(doc, false, false, false);
    const caps = doc.capabilities as Record<string, { priority?: string }>;
    expect(caps.search.priority).toBeUndefined();
    expect(caps.navigation.priority).toBeUndefined();
    expect(caps.forms.priority).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getCapabilityStatus
// ---------------------------------------------------------------------------

describe("getCapabilityStatus", () => {
  it("returns 'verified' when status is 'verified'", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).search = { status: "verified" };
    expect(getCapabilityStatus(doc, "search")).toBe("verified");
  });

  it("returns 'missing' when capability doesn't exist", () => {
    const doc = makeDoc();
    delete (doc.capabilities as Record<string, unknown>).search;
    expect(getCapabilityStatus(doc, "search")).toBe("missing");
  });

  it("returns 'not_found' when status is 'not_found'", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).navigation = { status: "not_found" };
    expect(getCapabilityStatus(doc, "navigation")).toBe("not_found");
  });
});

// --- autoFillBehavior ---

describe("autoFillBehavior", () => {
  it("fills behavior array when instructions.general is missing", () => {
    const doc = makeDoc();
    // Remove general instructions to simulate empty state
    delete (doc.instructions as Record<string, unknown>).general;
    autoFillBehavior(doc);
    const general = doc.instructions.general as { behavior?: string[] };
    expect(general.behavior).toBeDefined();
    expect(general.behavior!.length).toBeGreaterThanOrEqual(3);
  });

  it("fills behavior array when general exists but behavior is missing", () => {
    const doc = makeDoc();
    (doc.instructions as Record<string, unknown>).general = {
      language_note: "Site language: en",
      tips: ["Some tip"],
    };
    autoFillBehavior(doc);
    const general = doc.instructions.general as { behavior?: string[]; tips?: string[] };
    expect(general.behavior).toBeDefined();
    // Should preserve existing fields
    expect(general.tips).toContain("Some tip");
  });

  it("does not overwrite existing behavior array", () => {
    const doc = makeDoc();
    const customBehavior = ["Custom rule 1", "Custom rule 2"];
    (doc.instructions as Record<string, unknown>).general = {
      behavior: customBehavior,
    };
    autoFillBehavior(doc);
    const general = doc.instructions.general as { behavior?: string[] };
    expect(general.behavior).toEqual(customBehavior);
  });

  it("always includes Origin/Referer header instruction", () => {
    const doc = makeDoc();
    autoFillBehavior(doc);
    const general = doc.instructions.general as { behavior?: string[] };
    const hasOriginRule = general.behavior!.some(
      (rule) => rule.includes("Origin") && rule.includes("Referer"),
    );
    expect(hasOriginRule).toBe(true);
  });

  it("always includes priority level instruction", () => {
    const doc = makeDoc();
    autoFillBehavior(doc);
    const general = doc.instructions.general as { behavior?: string[] };
    const hasPriorityRule = general.behavior!.some(
      (rule) => rule.includes("power") && rule.includes("priority"),
    );
    expect(hasPriorityRule).toBe(true);
  });

  it("always includes JSON API preference instruction", () => {
    const doc = makeDoc();
    autoFillBehavior(doc);
    const general = doc.instructions.general as { behavior?: string[] };
    const hasApiRule = general.behavior!.some(
      (rule) => rule.includes("JSON API") || rule.includes("API endpoints"),
    );
    expect(hasApiRule).toBe(true);
  });
});

// --- REQUIRED_BEHAVIOR_RULES constant ---

describe("REQUIRED_BEHAVIOR_RULES", () => {
  it("contains Origin/Referer instruction", () => {
    const hasOrigin = REQUIRED_BEHAVIOR_RULES.some(
      (r) => r.includes("Origin") && r.includes("Referer"),
    );
    expect(hasOrigin).toBe(true);
  });

  it("contains at least 3 rules", () => {
    expect(REQUIRED_BEHAVIOR_RULES.length).toBeGreaterThanOrEqual(3);
  });
});

// --- Retry guarantee: agents always get enough chances ---

describe("MAX_PHASE_RETRIES", () => {
  it("is at least 3", () => {
    expect(MAX_PHASE_RETRIES).toBeGreaterThanOrEqual(3);
  });
});

// --- Retry contract: assessment functions always return actionable failure messages ---

describe("retry contract", () => {
  it("assessment failures are specific enough for an agent to act on", () => {
    const doc = makeDoc();
    // Deliberately leave everything empty — should get failures
    const manifesto = assessManifestoQuality(doc);
    expect(manifesto.length).toBeGreaterThan(0);
    // Each failure should mention the specific field that's wrong
    for (const f of manifesto) {
      expect(f.length).toBeGreaterThan(10);
      expect(f).toMatch(/site\.(name|language|type|description)/);
    }
  });

  it("search failures reference the specific issue", () => {
    const doc = makeDoc();
    // Set search to "found" (invalid — must be verified or not_found)
    (doc.capabilities as Record<string, unknown>).search = { status: "found" };
    const failures = assessSearchQuality(doc);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0]).toContain("verified");
    expect(failures[0]).toContain("not_found");
  });

  it("browse failures include category count when too few", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).navigation = { status: "verified" };
    (doc.instructions as Record<string, unknown>).browse = {
      how: "Navigate the site",
      when_to_use: "For browsing",
      categories: [
        { name: "Cat1", url: "https://example.com/cat1", contains: "Stuff" },
      ],
    };
    const failures = assessBrowseQuality(doc, "example.com");
    const countFailure = failures.find((f) => f.includes("entries"));
    expect(countFailure).toBeDefined();
    expect(countFailure).toContain("1");
    expect(countFailure).toContain("3");
  });

  it("forms safety failure identifies the unsafe pattern", () => {
    const doc = makeDoc();
    (doc.capabilities as Record<string, unknown>).forms = { status: "verified" };
    (doc.instructions as Record<string, unknown>).forms = {
      how: "POST to /checkout/filters",
      filters: [
        { name: "size", param: "size" },
        { name: "color", param: "color" },
      ],
    };
    const failures = assessFormsQuality(doc);
    const safetyFailure = failures.find((f) => f.includes("SAFETY"));
    expect(safetyFailure).toBeDefined();
    expect(safetyFailure).toContain("/checkout");
  });

  it("contact failures explain what real data means", () => {
    const doc = makeDoc();
    (doc.instructions as Record<string, unknown>).contact = {
      how: "Contact customer support",
      methods: ["Call us", "Email support"],
    };
    const failures = assessContactQuality(doc);
    const dataFailure = failures.find((f) => f.includes("real data"));
    expect(dataFailure).toBeDefined();
    expect(dataFailure).toContain("phone");
    expect(dataFailure).toContain("email");
    expect(dataFailure).toContain("URL");
  });
});
