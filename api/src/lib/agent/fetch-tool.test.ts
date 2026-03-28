import { describe, it, expect } from "vitest";
import { extractApiDomains } from "./fetch-tool";

describe("extractApiDomains", () => {
  it("extracts hostnames from URLs in a nested JSON object", () => {
    const obj = {
      search: {
        endpoint: "https://api.example.com/search",
      },
    };
    const domains = extractApiDomains(obj);
    expect(domains.has("api.example.com")).toBe(true);
  });

  it("handles multiple URLs across different fields", () => {
    const obj = {
      search: {
        endpoint: "https://search.algolia.net/1/indexes/queries",
      },
      browse: {
        categories: [
          { url: "https://www.shop.se/electronics" },
          { url: "https://www.shop.se/gaming" },
        ],
      },
      cdn: "https://images.cdn.net/logo.png",
    };
    const domains = extractApiDomains(obj);
    expect(domains.has("search.algolia.net")).toBe(true);
    expect(domains.has("www.shop.se")).toBe(true);
    expect(domains.has("images.cdn.net")).toBe(true);
  });

  it("returns empty set for object with no URLs", () => {
    const obj = {
      name: "My Site",
      language: "en",
      tips: ["tip one", "tip two"],
      count: 42,
    };
    const domains = extractApiDomains(obj);
    expect(domains.size).toBe(0);
  });

  it("handles malformed URLs gracefully", () => {
    const obj = {
      bad: "https://",
      also_bad: "http://",
      good: "https://valid.example.com/path",
    };
    const domains = extractApiDomains(obj);
    // The good URL should be extracted; malformed ones should be skipped
    expect(domains.has("valid.example.com")).toBe(true);
  });

  it("deduplicates hostnames", () => {
    const obj = {
      endpoint1: "https://api.example.com/search",
      endpoint2: "https://api.example.com/browse",
      endpoint3: "https://api.example.com/products?q=test",
    };
    const domains = extractApiDomains(obj);
    expect(domains.size).toBe(1);
    expect(domains.has("api.example.com")).toBe(true);
  });
});
