import { describe, expect, it } from "vitest";
import { extractPage } from "./page-extractor";

describe("extractPage", () => {
  it("extracts content and filters nav actions", () => {
    const page = extractPage({
      url: "https://example.com",
      title: "AT&amp;T",
      markdown: "ignored",
      html: `
        <html>
          <head>
            <title>Fallback</title>
            <script type="application/ld+json">{"@type":"Organization","name":"Example"}</script>
          </head>
          <body>
            <nav><a href="/pricing">Pricing</a></nav>
            <h1>Home</h1>
            <p>Read <a href="/about">about</a> us</p>
          </body>
        </html>
      `,
    });

    expect(page.title).toBe("AT&T");
    expect(page.sections.length).toBeGreaterThan(0);
    expect(page.meta.json_ld?.length).toBe(1);
    expect(page.actions.some((a) => a.context === "nav")).toBe(false);
    expect(page.actions.some((a) => a.type === "navigate" && a.url.includes("/about"))).toBe(true);
  });
});
