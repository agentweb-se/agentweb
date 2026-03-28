import { describe, it, expect } from "vitest";
import { hashContent } from "./hash";

describe("hashContent", () => {
  it("produces consistent hash for same input", () => {
    const a = hashContent({ name: "test", value: 42 });
    const b = hashContent({ name: "test", value: 42 });
    expect(a).toBe(b);
  });

  it("produces different hash for different input", () => {
    const a = hashContent({ name: "alpha" });
    const b = hashContent({ name: "beta" });
    expect(a).not.toBe(b);
  });

  it("produces same hash regardless of key order", () => {
    const a = hashContent({ a: 1, b: 2 });
    const b = hashContent({ b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it("returns a 16-character hex string", () => {
    const hash = hashContent({ anything: "here" });
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });
});
