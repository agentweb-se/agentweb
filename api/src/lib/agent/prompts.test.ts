import { describe, it, expect } from "vitest";
import { buildBaseSystemPrompt, buildAgentsJsonSystemPrompt } from "./prompts";

describe("buildBaseSystemPrompt", () => {
  it("includes the site URL", () => {
    const prompt = buildBaseSystemPrompt("https://www.example.com", "example.com");
    expect(prompt).toContain("https://www.example.com");
  });

  it("includes the domain", () => {
    const prompt = buildBaseSystemPrompt("https://www.example.com", "example.com");
    expect(prompt).toContain("example.com");
  });
});

describe("buildAgentsJsonSystemPrompt", () => {
  const sampleAgentsJson = {
    site: { name: "Test Shop", domain: "testshop.se" },
    capabilities: { search: { status: "verified" } },
  };

  it("includes serialized agents.json in output", () => {
    const prompt = buildAgentsJsonSystemPrompt(
      "https://www.testshop.se",
      "testshop.se",
      sampleAgentsJson,
    );
    expect(prompt).toContain('"name": "Test Shop"');
    expect(prompt).toContain('"status": "verified"');
  });

  it("includes site URL and domain", () => {
    const prompt = buildAgentsJsonSystemPrompt(
      "https://www.testshop.se",
      "testshop.se",
      sampleAgentsJson,
    );
    expect(prompt).toContain("https://www.testshop.se");
    expect(prompt).toContain("testshop.se");
  });

  it("wraps agents.json in XML-like tags", () => {
    const prompt = buildAgentsJsonSystemPrompt(
      "https://www.testshop.se",
      "testshop.se",
      sampleAgentsJson,
    );
    expect(prompt).toContain("<agents_json>");
    expect(prompt).toContain("</agents_json>");
  });
});
