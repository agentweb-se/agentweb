import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { extractActions } from "./actions";

describe("extractActions", () => {
  it("classifies navigate vs download and marks internal/external links", () => {
    const html = `
      <main>
        <a href="/about">About us</a>
        <a href="https://external.example.org/page">External</a>
        <a href="/files/report.pdf">Download report</a>
      </main>
    `;
    const $ = cheerio.load(html);

    const actions = extractActions($, "https://example.com");

    expect(actions).toHaveLength(3);
    expect(actions.find((a) => a.type === "download")?.url).toBe("https://example.com/files/report.pdf");
    expect(actions.find((a) => a.type === "navigate" && a.label === "About us")).toMatchObject({ internal: true });
    expect(actions.find((a) => a.type === "navigate" && a.label === "External")).toMatchObject({ internal: false });
  });

  it("extracts form submit action with fields and labels", () => {
    const html = `
      <form action="/contact" method="post" aria-label="Contact form">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" required />
        <select name="topic">
          <option>Sales</option>
          <option>Support</option>
        </select>
        <button type="submit">Send</button>
      </form>
    `;
    const $ = cheerio.load(html);

    const actions = extractActions($, "https://example.com");
    const submit = actions.find((a) => a.type === "submit");

    expect(submit).toBeDefined();
    expect(submit?.url).toBe("https://example.com/contact");
    expect(submit?.method).toBe("POST");
    expect(submit?.label).toBe("Send");
    expect(submit?.fields).toHaveLength(2);
    expect(submit?.fields[0]).toMatchObject({ name: "email", type: "email", required: true, label: "Email" });
    expect(submit?.fields[1]).toMatchObject({ name: "topic", type: "select" });
  });
});
