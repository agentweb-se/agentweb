import { describe, it, expect } from "vitest";
import { isNoiseRequest, isApiLikeResponse } from "./types";

describe("isNoiseRequest", () => {
  it("filters analytics URLs", () => {
    expect(isNoiseRequest("https://www.google-analytics.com/collect")).toBe(true);
    expect(isNoiseRequest("https://www.googletagmanager.com/gtm.js")).toBe(true);
    expect(isNoiseRequest("https://analytics.example.com/track")).toBe(true);
  });

  it("filters tracking URLs", () => {
    expect(isNoiseRequest("https://connect.facebook.net/en_US/fbevents.js")).toBe(true);
    expect(isNoiseRequest("https://pixel.example.com/track")).toBe(true);
  });

  it("filters static assets", () => {
    expect(isNoiseRequest("https://example.com/fonts/inter.woff2")).toBe(true);
    expect(isNoiseRequest("https://example.com/logo.png")).toBe(true);
    expect(isNoiseRequest("https://example.com/style.css")).toBe(true);
    expect(isNoiseRequest("https://example.com/bundle.js")).toBe(true);
  });

  it("does NOT filter API-like URLs", () => {
    expect(isNoiseRequest("https://api.example.com/v1/search?q=test")).toBe(false);
    expect(isNoiseRequest("https://example.com/api/products")).toBe(false);
    expect(isNoiseRequest("https://backend.example.com/graphql")).toBe(false);
  });
});

describe("isApiLikeResponse", () => {
  it("identifies JSON responses", () => {
    expect(isApiLikeResponse("application/json")).toBe(true);
    expect(isApiLikeResponse("application/json; charset=utf-8")).toBe(true);
  });

  it("identifies XML responses", () => {
    expect(isApiLikeResponse("application/xml")).toBe(true);
    expect(isApiLikeResponse("text/xml")).toBe(true);
  });

  it("rejects HTML responses", () => {
    expect(isApiLikeResponse("text/html")).toBe(false);
    expect(isApiLikeResponse("text/plain")).toBe(false);
  });
});
