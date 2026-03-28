import { describe, expect, it } from "vitest";
import { buildSections } from "./sections";
import type { ContentBlock } from "../schema";

describe("buildSections", () => {
  it("nests headings by level and keeps content under the nearest heading", () => {
    const blocks: ContentBlock[] = [
      { type: "heading", level: 1, text: "Main" },
      { type: "text", text: "Intro" },
      { type: "heading", level: 2, text: "Sub" },
      { type: "text", text: "Sub text" },
      { type: "heading", level: 2, text: "Peer" },
      { type: "text", text: "Peer text" },
    ];

    const sections = buildSections(blocks);

    expect(sections).toHaveLength(1);
    expect(sections[0].heading?.text).toBe("Main");
    expect(sections[0].content).toHaveLength(1);
    expect(sections[0].subsections).toHaveLength(2);
    expect(sections[0].subsections[0].heading?.text).toBe("Sub");
    expect(sections[0].subsections[1].heading?.text).toBe("Peer");
  });

  it("creates a root section when content appears before first heading", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "Loose content" },
      { type: "heading", level: 1, text: "After" },
    ];

    const sections = buildSections(blocks);

    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBeUndefined();
    expect(sections[0].content[0]).toMatchObject({ type: "text", text: "Loose content" });
    expect(sections[0].subsections[0].heading?.text).toBe("After");
  });
});
