import { describe, it, expect } from "vitest";
import { parseJsonLd } from "./json-ld";

describe("parseJsonLd", () => {
  it("extracts single JSON-LD object from script tag", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {"@type": "Organization", "name": "TestCorp", "url": "https://test.com"}
        </script>
      </head><body></body></html>
    `;
    const result = parseJsonLd(html);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      "@type": "Organization",
      name: "TestCorp",
      url: "https://test.com",
    });
  });

  it("extracts multiple JSON-LD script blocks", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {"@type": "Organization", "name": "TestCorp"}
        </script>
        <script type="application/ld+json">
          {"@type": "WebSite", "name": "Test Site", "url": "https://test.com"}
        </script>
      </head><body></body></html>
    `;
    const result = parseJsonLd(html);
    expect(result).toHaveLength(2);
    expect((result[0] as Record<string, unknown>)["@type"]).toBe("Organization");
    expect((result[1] as Record<string, unknown>)["@type"]).toBe("WebSite");
  });

  it("handles @graph arrays (flattens items)", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@graph": [
              {"@type": "Organization", "name": "Corp"},
              {"@type": "WebSite", "name": "Site"}
            ]
          }
        </script>
      </head><body></body></html>
    `;
    const result = parseJsonLd(html);
    expect(result).toHaveLength(2);
    expect((result[0] as Record<string, unknown>)["@type"]).toBe("Organization");
    expect((result[1] as Record<string, unknown>)["@type"]).toBe("WebSite");
  });

  it("skips malformed JSON-LD silently", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {this is not valid json}
        </script>
        <script type="application/ld+json">
          {"@type": "Organization", "name": "Valid"}
        </script>
      </head><body></body></html>
    `;
    const result = parseJsonLd(html);
    expect(result).toHaveLength(1);
    expect((result[0] as Record<string, unknown>)["name"]).toBe("Valid");
  });

  it("returns empty array for HTML with no JSON-LD", () => {
    const html = `
      <html><head><title>No JSON-LD here</title></head>
      <body><p>Hello world</p></body></html>
    `;
    const result = parseJsonLd(html);
    expect(result).toEqual([]);
  });
});
