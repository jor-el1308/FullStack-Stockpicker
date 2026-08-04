/**
 * Owner: Yong Wee (Person 1) - Auth + AI Recommendation.
 * Unit tests for ai.service.js - the core "send shortlisted stocks to an LLM"
 * logic. The global fetch() is stubbed so these tests never hit a real
 * provider or need a real API key.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getQualitativeAnalysis } from "../../src/services/ai.service.js";

function mockFetchOk(responseBody) {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => responseBody,
    text: async () => JSON.stringify(responseBody),
  });
}

const singleStock = [
  { exchangeCode: "SGX", stockCode: "D05", stockName: "DBS Group Holdings", values: { marketCap: 95000000000 } },
];

const twoStocks = [
  { exchangeCode: "SGX", stockCode: "D05", stockName: "DBS Group Holdings" },
  { exchangeCode: "SGX", stockCode: "O39", stockName: "OCBC Bank" },
];

describe("ai.service - getQualitativeAnalysis", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.AI_RECOMMENDATION_API_KEY = "test-gemini-key";
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AI_RECOMMENDATION_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });

  it("returns mode 'single' with markdown stripped for exactly one stock", async () => {
    mockFetchOk({
      candidates: [
        {
          content: {
            parts: [
              {
                text:
                  "**DBS Group Holdings**: Strong regional bank.\n" +
                  "- Solid loan growth\n" +
                  "# Disclaimer\n" +
                  "This is *not* financial advice.",
              },
            ],
          },
        },
      ],
    });

    const result = await getQualitativeAnalysis(singleStock, {});

    expect(result.mode).toBe("single");
    expect(result.text).toContain("DBS Group Holdings");
    // stripMarkdown() should have removed every markdown token - none of
    // these characters should survive into the client-rendered plain text.
    expect(result.text).not.toMatch(/[*#_`]/);
  });

  it("sends single-stock requests to Gemini's endpoint with the API key as a query param", async () => {
    mockFetchOk({ candidates: [{ content: { parts: [{ text: "Fine." }] } }] });

    await getQualitativeAnalysis(singleStock, {});

    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(url).toContain("key=test-gemini-key");
  });

  it("weaves the selected persona and custom instructions into the prompt sent to the model", async () => {
    mockFetchOk({ candidates: [{ content: { parts: [{ text: "Fine." }] } }] });

    await getQualitativeAnalysis(singleStock, {
      aiPersona: "growth",
      customInstructions: "Focus on ASX-listed stocks.",
    });

    const [, options] = global.fetch.mock.calls[0];
    const prompt = JSON.parse(options.body).contents[0].parts[0].text;
    expect(prompt).toContain("growth-focused financial analyst");
    expect(prompt).toContain("Focus on ASX-listed stocks.");
  });

  it("returns mode 'comparison' with a parsed winner per criterion for two or more stocks", async () => {
    const comparisonPayload = {
      stocks: ["DBS Group Holdings", "OCBC Bank"],
      criteria: [
        {
          name: "Growth outlook",
          notes: ["Steady loan growth.", "Modest but stable growth."],
          winner: "DBS Group Holdings",
        },
      ],
      summary: "DBS edges ahead on growth momentum.",
      disclaimer: "This is not financial advice.",
    };
    // Models sometimes wrap the JSON in a code fence despite being told not
    // to - parseComparisonResponse() slices between the first "{" and last
    // "}", so this should still parse correctly.
    mockFetchOk({
      candidates: [{ content: { parts: [{ text: "```json\n" + JSON.stringify(comparisonPayload) + "\n```" }] } }],
    });

    const result = await getQualitativeAnalysis(twoStocks, {});

    expect(result.mode).toBe("comparison");
    expect(result.comparison.stocks).toEqual(["DBS Group Holdings", "OCBC Bank"]);
    expect(result.comparison.criteria[0].winner).toBe("DBS Group Holdings");
  });

  it("throws when the comparison response has no JSON object in it at all", async () => {
    mockFetchOk({ candidates: [{ content: { parts: [{ text: "Sorry, I can't compare these." }] } }] });

    await expect(getQualitativeAnalysis(twoStocks, {})).rejects.toThrow(/not valid JSON/);
  });

  it("throws when the comparison JSON is missing the stocks/criteria fields", async () => {
    mockFetchOk({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: "no criteria here" }) }] } }],
    });

    await expect(getQualitativeAnalysis(twoStocks, {})).rejects.toThrow(/missing the expected/);
  });

  it("throws a clear error when AI_RECOMMENDATION_API_KEY is missing for the default tier", async () => {
    delete process.env.AI_RECOMMENDATION_API_KEY;

    await expect(getQualitativeAnalysis(singleStock, {})).rejects.toThrow(/AI_RECOMMENDATION_API_KEY is not set/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("throws when Gemini responds with a non-2xx status", async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 429, text: async () => "rate limited" });

    await expect(getQualitativeAnalysis(singleStock, {})).rejects.toThrow(/Gemini request failed \(429\)/);
  });

  it("throws when the model returns an empty response", async () => {
    mockFetchOk({ candidates: [] });

    await expect(getQualitativeAnalysis(singleStock, {})).rejects.toThrow(/empty response/);
  });

  it("routes non-flash tiers through OpenRouter with a bearer token", async () => {
    mockFetchOk({ choices: [{ message: { content: "GPT-4o mini take on DBS." } }] });

    const result = await getQualitativeAnalysis(singleStock, { aiModelTier: "gpt-4o-mini" });

    expect(result.text).toContain("GPT-4o mini take on DBS.");
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain("openrouter.ai");
    expect(options.headers.Authorization).toBe("Bearer test-openrouter-key");
  });

  it("throws a clear error when OPENROUTER_API_KEY is missing for a non-flash tier", async () => {
    delete process.env.OPENROUTER_API_KEY;

    await expect(getQualitativeAnalysis(singleStock, { aiModelTier: "claude-haiku" })).rejects.toThrow(
      /OPENROUTER_API_KEY is not set/
    );
  });
});
