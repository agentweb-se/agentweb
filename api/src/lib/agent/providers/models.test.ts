import { describe, it, expect, afterEach, vi } from "vitest";
import {
  getModelInfo,
  getModelCost,
  getAllModels,
  getPhaseModel,
  DEFAULT_MODEL,
} from "./models";

describe("getModelInfo", () => {
  it("returns ModelInfo for claude-sonnet-4-6", () => {
    const info = getModelInfo("claude-sonnet-4-6");
    expect(info).toBeDefined();
    expect(info!.id).toBe("claude-sonnet-4-6");
    expect(info!.provider).toBe("anthropic");
    expect(info!.name).toBe("Claude Sonnet 4.6");
    expect(info!.tier).toBe("balanced");
    expect(info!.supportsTools).toBe(true);
  });

  it("returns ModelInfo for gpt-4o", () => {
    const info = getModelInfo("gpt-4o");
    expect(info).toBeDefined();
    expect(info!.id).toBe("gpt-4o");
    expect(info!.provider).toBe("openai");
    expect(info!.name).toBe("GPT-4o");
  });

  it("returns undefined for unknown model", () => {
    const info = getModelInfo("totally-fake-model-9000");
    expect(info).toBeUndefined();
  });
});

describe("getModelCost", () => {
  it("returns correct costs for a known model", () => {
    const cost = getModelCost("claude-sonnet-4-6");
    expect(cost.inputPer1M).toBe(3);
    expect(cost.outputPer1M).toBe(15);
  });

  it("returns fallback (3, 15) for unknown model", () => {
    const cost = getModelCost("nonexistent-model");
    expect(cost.inputPer1M).toBe(3);
    expect(cost.outputPer1M).toBe(15);
  });
});

describe("getAllModels", () => {
  it("returns non-empty array", () => {
    const models = getAllModels();
    expect(models.length).toBeGreaterThan(0);
  });

  it("returns a copy (push to result should not affect next call)", () => {
    const first = getAllModels();
    const originalLength = first.length;
    first.push({
      id: "fake",
      provider: "openai",
      name: "Fake",
      tier: "fast",
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      maxOutputTokens: 0,
      supportsTools: false,
    });
    const second = getAllModels();
    expect(second.length).toBe(originalLength);
  });
});

describe("getPhaseModel", () => {
  const savedEnv: Record<string, string | undefined> = {};

  afterEach(() => {
    // Clean up any env vars we set
    for (const key of Object.keys(savedEnv)) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    // Reset saved state
    for (const key of Object.keys(savedEnv)) {
      delete savedEnv[key];
    }
  });

  function setEnv(key: string, value: string) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }

  function clearEnv(key: string) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }

  it("returns DEFAULT_MODEL when no env vars set", () => {
    clearEnv("AGENT_MODEL");
    clearEnv("EXPLORER_SEARCH_MODEL");
    const model = getPhaseModel("search");
    expect(model).toBe(DEFAULT_MODEL);
  });

  it("returns AGENT_MODEL when set", () => {
    setEnv("AGENT_MODEL", "gpt-4o");
    clearEnv("EXPLORER_SEARCH_MODEL");
    const model = getPhaseModel("search");
    expect(model).toBe("gpt-4o");
  });

  it("returns phase-specific var when set (EXPLORER_SEARCH_MODEL)", () => {
    setEnv("AGENT_MODEL", "gpt-4o");
    setEnv("EXPLORER_SEARCH_MODEL", "claude-opus-4-6");
    const model = getPhaseModel("search");
    expect(model).toBe("claude-opus-4-6");
  });

  it("phase-specific var takes priority over AGENT_MODEL", () => {
    setEnv("AGENT_MODEL", "gpt-4o");
    setEnv("EXPLORER_BROWSE_MODEL", "gemini-2.5-pro");
    const model = getPhaseModel("browse");
    expect(model).toBe("gemini-2.5-pro");
  });
});
