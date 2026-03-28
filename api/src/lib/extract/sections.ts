import type { ContentBlock, Section } from "../schema";
import { hashContent } from "./hash";

/**
 * Compute a deduplication key for a section (heading text + content hash).
 */
function sectionKey(section: Section): string {
  const heading = section.heading ? `${section.heading.level}:${section.heading.text}` : "_none_";
  const contentHash = hashContent(section.content);
  return `${heading}|${contentHash}`;
}

/**
 * Remove duplicate sections (same heading + content) recursively.
 */
function deduplicateSections(sections: Section[]): Section[] {
  const seen = new Set<string>();
  const result: Section[] = [];
  for (const section of sections) {
    const key = sectionKey(section);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      ...section,
      subsections: deduplicateSections(section.subsections),
    });
  }
  return result;
}

/**
 * Build a heading-based section tree from a flat list of ContentBlocks.
 * Pure, synchronous, deterministic.
 *
 * Algorithm:
 * - Walk blocks in order, maintain a stack of (Section, level) entries
 * - On heading: pop until top has level < this heading, create new section
 * - On non-heading: add to top-of-stack's content
 * - Pre-heading content goes into a root section with heading: undefined
 */
export function buildSections(blocks: ContentBlock[]): Section[] {
  const roots: Section[] = [];
  const stack: { section: Section; level: number }[] = [];

  function currentSection(): Section | null {
    return stack.length > 0 ? stack[stack.length - 1].section : null;
  }

  for (const block of blocks) {
    if (block.type === "heading") {
      const level = block.level;

      // Pop stack until top has level < this heading
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      const section: Section = {
        heading: { level: block.level, text: block.text, id: block.id },
        content: [],
        subsections: [],
      };

      const parent = currentSection();
      if (parent) {
        parent.subsections.push(section);
      } else {
        roots.push(section);
      }

      stack.push({ section, level });
    } else {
      // Non-heading block — add to current section's content
      const target = currentSection();
      if (target) {
        target.content.push(block);
      } else {
        // No heading yet — create root section with no heading
        const section: Section = {
          heading: undefined,
          content: [block],
          subsections: [],
        };
        roots.push(section);
        stack.push({ section, level: 0 });
      }
    }
  }

  return deduplicateSections(roots);
}
