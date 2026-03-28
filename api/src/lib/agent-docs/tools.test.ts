import { describe, it, expect } from "vitest";
import { executeWriteSection } from "./tools";
import { blankAgentsJsonTemplate } from "./schema";
import type { AgentsJson } from "./schema";

/** Fresh doc for each test */
function makeDoc(): AgentsJson {
  return blankAgentsJsonTemplate();
}

/** Spy send function — collects emitted events */
function makeSend(): { send: (data: Record<string, unknown>) => void; events: Record<string, unknown>[] } {
  const events: Record<string, unknown>[] = [];
  const send = (data: Record<string, unknown>) => events.push(data);
  return { send, events };
}

// ─── Metadata rejection ─────────────────────────────────────────────

describe("executeWriteSection — metadata rejection", () => {
  it("rejects write to 'version'", () => {
    const doc = makeDoc();
    const { send } = makeSend();
    const result = executeWriteSection("version", { value: "2.0" }, doc, send);
    expect(result).toContain("auto-managed");
    expect(result).toContain("version");
  });

  it("rejects write to 'generated_at'", () => {
    const doc = makeDoc();
    const { send } = makeSend();
    const result = executeWriteSection("generated_at", { value: "2026-01-01" }, doc, send);
    expect(result).toContain("auto-managed");
    expect(result).toContain("generated_at");
  });

  it("rejects write to 'generator'", () => {
    const doc = makeDoc();
    const { send } = makeSend();
    const result = executeWriteSection("generator", { value: "custom" }, doc, send);
    expect(result).toContain("auto-managed");
    expect(result).toContain("generator");
  });
});

// ─── Section scoping ─────────────────────────────────────────────────

describe("executeWriteSection — section scoping", () => {
  it("rejects write outside allowedSections", () => {
    const doc = makeDoc();
    const { send } = makeSend();
    const result = executeWriteSection(
      "site",
      { name: "Test" },
      doc,
      send,
      ["instructions.search"],
    );
    expect(result).toContain("not your job");
  });

  it("allows write to exact match in allowedSections", () => {
    const doc = makeDoc();
    const { send } = makeSend();
    const result = executeWriteSection(
      "instructions.search",
      { how: "GET /search?q={query}", tips: [] },
      doc,
      send,
      ["instructions.search"],
    );
    expect(result).toContain("written successfully");
  });

  it("allows write to path starting with allowed prefix", () => {
    const doc = makeDoc();
    const { send } = makeSend();
    // "instructions" is allowed, so "instructions.search" should also be allowed
    const result = executeWriteSection(
      "instructions.search",
      { how: "POST /api/search", tips: ["use swedish"] },
      doc,
      send,
      ["instructions"],
    );
    expect(result).toContain("written successfully");
  });

  it("allows any section when allowedSections is undefined", () => {
    const doc = makeDoc();
    const { send } = makeSend();
    const result = executeWriteSection(
      "site",
      { name: "Test", domain: "test.com", language: "en", type: "saas", description: "A test site" },
      doc,
      send,
      undefined,
    );
    expect(result).toContain("written successfully");
  });
});

// ─── Dot-path parsing ────────────────────────────────────────────────

describe("executeWriteSection — dot-path parsing", () => {
  it("writes top-level 'site' correctly", () => {
    const doc = makeDoc();
    const { send } = makeSend();
    const siteData = { name: "Acme", domain: "acme.com", language: "en", type: "e-commerce", description: "Acme store" };
    const result = executeWriteSection("site", siteData, doc, send);
    expect(result).toContain("written successfully");
    expect(doc.site).toEqual(siteData);
  });

  it("writes nested 'instructions.search' correctly", () => {
    const doc = makeDoc();
    const { send } = makeSend();
    const searchData = { how: "GET /search?q={query}", tips: ["search in swedish"] };
    const result = executeWriteSection("instructions.search", searchData, doc, send);
    expect(result).toContain("written successfully");
    expect((doc.instructions as Record<string, unknown>).search).toEqual(searchData);
  });

  it("writes nested 'capabilities.navigation' correctly", () => {
    const doc = makeDoc();
    const { send } = makeSend();
    const navData = { status: "found", details: "Main nav with categories" };
    const result = executeWriteSection("capabilities.navigation", navData, doc, send);
    expect(result).toContain("written successfully");
    expect((doc.capabilities as Record<string, unknown>).navigation).toEqual(navData);
  });

  it("rejects 3+ deep path", () => {
    const doc = makeDoc();
    const { send } = makeSend();
    const result = executeWriteSection("instructions.search.tips", { value: ["tip1"] }, doc, send);
    expect(result).toContain("Invalid section path");
  });

  it("rejects unknown parent key", () => {
    const doc = makeDoc();
    const { send } = makeSend();
    const result = executeWriteSection("nonexistent.child", { value: "test" }, doc, send);
    expect(result).toContain("Unknown parent section");
  });
});

// ─── Event emission ──────────────────────────────────────────────────

describe("executeWriteSection — event emission", () => {
  it("send is called with section-written event type", () => {
    const doc = makeDoc();
    const { send, events } = makeSend();
    executeWriteSection("site", { name: "Test", domain: "test.com", language: "en", type: "blog", description: "A blog" }, doc, send);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("section-written");
  });

  it("includes section name and data in the event", () => {
    const doc = makeDoc();
    const { send, events } = makeSend();
    const data = { how: "GET /api/search", tips: ["tip1"] };
    executeWriteSection("instructions.search", data, doc, send);
    expect(events).toHaveLength(1);
    expect(events[0].section).toBe("instructions.search");
    expect(events[0].data).toEqual(data);
  });
});

// ─── Completion detection ────────────────────────────────────────────

describe("executeWriteSection — completion detection", () => {
  it("returns completion message when ALL allowedSections are written", () => {
    const doc = makeDoc();
    const { send } = makeSend();
    const allowed = ["instructions.search", "instructions.contact"];

    // Write the first section — not complete yet
    executeWriteSection(
      "instructions.search",
      { how: "GET /search?q={query}", tips: [] },
      doc,
      send,
      allowed,
    );

    // Write the second section — now complete
    const result = executeWriteSection(
      "instructions.contact",
      { how: "Call support", methods: ["phone"] },
      doc,
      send,
      allowed,
    );
    expect(result).toContain("ALL REQUIRED SECTIONS ARE NOW COMPLETE");
  });

  it("does not return completion when some sections remain unwritten", () => {
    const doc = makeDoc();
    const { send } = makeSend();
    const allowed = ["instructions.search", "instructions.contact"];

    const result = executeWriteSection(
      "instructions.search",
      { how: "GET /search?q={query}", tips: [] },
      doc,
      send,
      allowed,
    );
    expect(result).not.toContain("ALL REQUIRED SECTIONS ARE NOW COMPLETE");
    expect(result).toContain("written successfully");
  });

  it("handles mixed top-level and nested allowed sections", () => {
    const doc = makeDoc();
    const { send } = makeSend();
    const allowed = ["site", "instructions.search"];

    // Write site (top-level)
    executeWriteSection(
      "site",
      { name: "Test", domain: "test.com", language: "en", type: "e-commerce", description: "Store" },
      doc,
      send,
      allowed,
    );

    // Write instructions.search (nested) — should complete
    const result = executeWriteSection(
      "instructions.search",
      { how: "GET /search", tips: [] },
      doc,
      send,
      allowed,
    );
    expect(result).toContain("ALL REQUIRED SECTIONS ARE NOW COMPLETE");
  });

  it("detects completion with nested paths correctly", () => {
    const doc = makeDoc();
    const { send } = makeSend();
    const allowed = ["instructions.browse", "instructions.general"];

    // Write first instruction — browse
    const first = executeWriteSection(
      "instructions.browse",
      { how: "Navigate categories", when_to_use: "browsing", categories: [], tips: [] },
      doc,
      send,
      allowed,
    );
    expect(first).not.toContain("ALL REQUIRED SECTIONS ARE NOW COMPLETE");

    // Write second instruction — general — now complete
    const second = executeWriteSection(
      "instructions.general",
      { language_note: "Swedish site", tips: ["use sv"] },
      doc,
      send,
      allowed,
    );
    expect(second).toContain("ALL REQUIRED SECTIONS ARE NOW COMPLETE");
  });
});
