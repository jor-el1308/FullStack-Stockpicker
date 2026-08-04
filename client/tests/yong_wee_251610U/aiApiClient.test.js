/**
 * Owner: Yong Wee (Person 1) - Auth + AI Recommendation.
 * Unit tests for the thin API-client wrappers (client/src/api/ai.js and
 * client/src/api/aiPreferences.js) - verifies each function hits the
 * correct method/path with the correct body, per api-documentation.md.
 * global.fetch is stubbed so no real network call happens.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyzeStocks, getAiHistory, updateAiHistoryEntry, deleteAiHistoryEntry } from "../../src/api/ai";
import { getAiPreferences, updateAiPreferences } from "../../src/api/aiPreferences";

function mockFetchJson(data) {
  global.fetch.mockResolvedValue({
    text: async () => JSON.stringify({ success: true, data }),
  });
}

describe("api/ai.js", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("analyzeStocks POSTs the shortlist to /api/ai/analyze", async () => {
    mockFetchJson({ analysis: "text", mode: "single" });
    const stocks = [{ exchangeCode: "SGX", stockCode: "D05", stockName: "DBS Group Holdings" }];

    const result = await analyzeStocks(stocks);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/ai/analyze");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ stocks });
    expect(result).toEqual({ analysis: "text", mode: "single" });
  });

  it("getAiHistory GETs /api/ai/history", async () => {
    mockFetchJson({ history: [] });

    await getAiHistory();

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/ai/history");
    expect(options?.method).toBeUndefined(); // api.get() sends no explicit method (defaults to GET)
  });

  it("updateAiHistoryEntry PATCHes /api/ai/history/:id with only the changed fields", async () => {
    mockFetchJson({ id: "a1", title: "New title" });

    await updateAiHistoryEntry("a1", { title: "New title" });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/ai/history/a1");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body)).toEqual({ title: "New title" });
  });

  it("deleteAiHistoryEntry DELETEs /api/ai/history/:id", async () => {
    mockFetchJson({ id: "a1" });

    await deleteAiHistoryEntry("a1");

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/ai/history/a1");
    expect(options.method).toBe("DELETE");
  });
});

describe("api/aiPreferences.js", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("getAiPreferences GETs /api/ai/preferences", async () => {
    mockFetchJson({ aiModelTier: "flash" });

    const result = await getAiPreferences();

    expect(global.fetch.mock.calls[0][0]).toBe("/api/ai/preferences");
    expect(result).toEqual({ aiModelTier: "flash" });
  });

  it("updateAiPreferences PATCHes /api/ai/preferences with only the changed fields", async () => {
    mockFetchJson({ aiPersona: "growth" });

    await updateAiPreferences({ aiPersona: "growth" });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/ai/preferences");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body)).toEqual({ aiPersona: "growth" });
  });
});
