import { describe, it, expect } from "vitest";
import {
  buildManifestoPrompt,
  buildManifestoRetryPrompt,
  buildSearchPrompt,
  buildSearchRetryPrompt,
  buildBrowsePrompt,
  buildBrowseRetryPrompt,
  buildFormsPrompt,
  buildFormsRetryPrompt,
  buildContactPrompt,
  buildContactRetryPrompt,
} from "./prompts";

const siteInfo = {
  name: "TestShop",
  domain: "testshop.se",
  language: "sv",
  type: "e-commerce",
};

describe("buildManifestoPrompt", () => {
  it("includes the URL", () => {
    const prompt = buildManifestoPrompt("https://www.testshop.se");
    expect(prompt).toContain("https://www.testshop.se");
  });

  it("includes write_section reference", () => {
    const prompt = buildManifestoPrompt("https://www.testshop.se");
    expect(prompt).toContain("write_section");
  });
});

describe("buildManifestoRetryPrompt", () => {
  it("includes failures in output", () => {
    const failures = ["Missing site section", "Missing instructions.general"];
    const prompt = buildManifestoRetryPrompt(failures);
    expect(prompt).toContain("Missing site section");
    expect(prompt).toContain("Missing instructions.general");
  });
});

describe("buildSearchPrompt", () => {
  it("includes site name and domain", () => {
    const prompt = buildSearchPrompt("https://www.testshop.se", siteInfo);
    expect(prompt).toContain("TestShop");
    expect(prompt).toContain("testshop.se");
  });
});

describe("buildSearchRetryPrompt", () => {
  it("includes failures", () => {
    const failures = ["capabilities.search.status must be verified or not_found"];
    const currentState = { search_cap: null, search_inst: null };
    const prompt = buildSearchRetryPrompt(failures, currentState);
    expect(prompt).toContain("capabilities.search.status must be verified or not_found");
  });
});

describe("buildBrowsePrompt", () => {
  it("includes domain", () => {
    const prompt = buildBrowsePrompt("https://www.testshop.se", siteInfo, true);
    expect(prompt).toContain("testshop.se");
  });
});

describe("buildBrowseRetryPrompt", () => {
  it("includes failures", () => {
    const failures = ["capabilities.navigation.status missing"];
    const currentState = { nav_cap: null, browse_inst: null };
    const prompt = buildBrowseRetryPrompt(failures, currentState);
    expect(prompt).toContain("capabilities.navigation.status missing");
  });
});

describe("buildFormsPrompt", () => {
  it("includes domain", () => {
    const prompt = buildFormsPrompt("https://www.testshop.se", siteInfo, {
      searchEndpoint: null,
      categoryUrls: [],
    });
    expect(prompt).toContain("testshop.se");
  });
});

describe("buildFormsRetryPrompt", () => {
  it("includes failures", () => {
    const failures = ["capabilities.forms.status must be verified or not_found"];
    const currentState = { forms_cap: null, forms_inst: null };
    const prompt = buildFormsRetryPrompt(failures, currentState);
    expect(prompt).toContain("capabilities.forms.status must be verified or not_found");
  });
});

describe("buildContactPrompt", () => {
  it("includes domain", () => {
    const prompt = buildContactPrompt("https://www.testshop.se", siteInfo);
    expect(prompt).toContain("testshop.se");
  });
});

describe("buildContactRetryPrompt", () => {
  it("includes failures", () => {
    const failures = ["instructions.contact missing methods"];
    const currentState = { contact_inst: null, policies_inst: null };
    const prompt = buildContactRetryPrompt(failures, currentState);
    expect(prompt).toContain("instructions.contact missing methods");
  });
});

// --- Retry prompt contract: every retry prompt includes ALL failures + current state ---

describe("retry prompt contract", () => {
  it("manifesto retry includes all failures as numbered list", () => {
    const failures = [
      "site.name is missing.",
      "site.language is missing.",
      "site.description is missing or too short.",
    ];
    const prompt = buildManifestoRetryPrompt(failures);
    for (const f of failures) {
      expect(prompt).toContain(f);
    }
    // Should be numbered
    expect(prompt).toContain("1.");
    expect(prompt).toContain("2.");
    expect(prompt).toContain("3.");
  });

  it("search retry includes failures AND current state JSON", () => {
    const failures = [
      'capabilities.search.status is "found" — must be "verified" or "not_found".',
      "instructions.search.how has no URL.",
    ];
    const currentState = {
      search_cap: { status: "found" },
      search_inst: { how: "Search the site" },
    };
    const prompt = buildSearchRetryPrompt(failures, currentState);
    for (const f of failures) {
      expect(prompt).toContain(f);
    }
    // Must include current state so agent can see what it wrote
    expect(prompt).toContain('"status": "found"');
    expect(prompt).toContain('"how": "Search the site"');
  });

  it("browse retry includes failures AND current state JSON", () => {
    const failures = [
      "instructions.browse.categories has 1 entries — need at least 3.",
    ];
    const currentState = {
      nav_cap: { status: "verified" },
      browse_inst: { categories: [{ name: "Electronics" }] },
    };
    const prompt = buildBrowseRetryPrompt(failures, currentState);
    expect(prompt).toContain("1 entries");
    expect(prompt).toContain("Electronics");
  });

  it("forms retry includes failures AND current state JSON", () => {
    const failures = [
      "instructions.forms.filters has 0 entries — need at least 2.",
    ];
    const currentState = {
      forms_cap: { status: "verified" },
      forms_inst: { how: "Use filters", filters: [] },
    };
    const prompt = buildFormsRetryPrompt(failures, currentState);
    expect(prompt).toContain("0 entries");
    expect(prompt).toContain('"filters": []');
  });

  it("contact retry includes failures AND current state JSON", () => {
    const failures = [
      "No contact method contains real data.",
    ];
    const currentState = {
      contact_inst: { methods: ["Call us"] },
      policies_inst: null,
    };
    const prompt = buildContactRetryPrompt(failures, currentState);
    expect(prompt).toContain("real data");
    expect(prompt).toContain("Call us");
  });
});
