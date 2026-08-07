/**
 * Owner: Yong Wee (Person 1) - Auth + AI Recommendation.
 * Unit tests for ai.controller.js - request validation, the single-vs-
 * comparison response shape, best-effort history persistence, and error
 * mapping (400/404/500). The service layer is mocked so these tests never
 * call a real AI provider or database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/services/ai.service.js", () => ({
  getQualitativeAnalysis: vi.fn(),
  getFollowUpAnswer: vi.fn(),
}));
// Partial mock: keep the real AiAnalysisNotFoundError class (so
// `instanceof` checks in the controller still work) but stub every function
// the service exports.
vi.mock("../../src/services/aiHistory.service.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    saveAiAnalysis: vi.fn(),
    listAiAnalysisHistory: vi.fn(),
    updateAiAnalysis: vi.fn(),
    deleteAiAnalysis: vi.fn(),
  };
});
vi.mock("../../src/services/aiPreferences.service.js", () => ({
  getAiPreferences: vi.fn(),
}));

import { getQualitativeAnalysis, getFollowUpAnswer } from "../../src/services/ai.service.js";
import {
  saveAiAnalysis,
  listAiAnalysisHistory,
  updateAiAnalysis,
  deleteAiAnalysis,
  AiAnalysisNotFoundError,
} from "../../src/services/aiHistory.service.js";
import { getAiPreferences } from "../../src/services/aiPreferences.service.js";
import {
  analyzeStocks,
  chatAboutStocks,
  getAiHistory,
  updateAiHistoryEntry,
  deleteAiHistoryEntry,
} from "../../src/controllers/ai.controller.js";

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const oneStock = [{ exchangeCode: "SGX", stockCode: "D05", stockName: "DBS Group Holdings" }];

describe("ai.controller - analyzeStocks", () => {
  const preferences = { aiPersona: "balanced", aiDetailLevel: "concise" };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    getAiPreferences.mockResolvedValue(preferences);
  });

  it("rejects an empty stocks array with 400", async () => {
    const req = { userId: "user-1", body: { stocks: [] } };
    const res = mockRes();

    await analyzeStocks(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getQualitativeAnalysis).not.toHaveBeenCalled();
  });

  it("rejects more than 10 shortlisted stocks with 400", async () => {
    const stocks = Array.from({ length: 11 }, (_, i) => ({
      exchangeCode: "SGX",
      stockCode: `S${i}`,
      stockName: `Stock ${i}`,
    }));
    const req = { userId: "user-1", body: { stocks } };
    const res = mockRes();

    await analyzeStocks(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getQualitativeAnalysis).not.toHaveBeenCalled();
  });

  it("returns a single-stock write-up and persists it to history", async () => {
    getQualitativeAnalysis.mockResolvedValue({ mode: "single", text: "DBS Group Holdings: solid pick." });
    saveAiAnalysis.mockResolvedValue({ id: "a1", title: "D05" });
    const req = { userId: "user-1", body: { stocks: oneStock } };
    const res = mockRes();

    await analyzeStocks(req, res);

    // `preferences` is echoed back alongside the analysis so the client can
    // snapshot exactly what this run used into AiChatBox's follow-up context
    // (see ai.controller.js) - it isn't re-derived from anything already in
    // the response, so it has to be asserted explicitly.
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { analysis: "DBS Group Holdings: solid pick.", mode: "single", preferences },
    });
    expect(saveAiAnalysis).toHaveBeenCalledWith("user-1", oneStock, "DBS Group Holdings: solid pick.");
  });

  it("stores a comparison result as a JSON string but returns it as an object", async () => {
    const comparison = { stocks: ["DBS", "OCBC"], criteria: [], summary: "s", disclaimer: "d" };
    getQualitativeAnalysis.mockResolvedValue({ mode: "comparison", comparison });
    saveAiAnalysis.mockResolvedValue({ id: "a1", title: "D05, O39" });
    const req = { userId: "user-1", body: { stocks: [oneStock[0], { ...oneStock[0], stockCode: "O39" }] } };
    const res = mockRes();

    await analyzeStocks(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { analysis: comparison, mode: "comparison", preferences },
    });
    expect(saveAiAnalysis).toHaveBeenCalledWith(expect.anything(), expect.anything(), JSON.stringify(comparison));
  });

  it("still returns the analysis when saving to history fails (best-effort persistence)", async () => {
    getQualitativeAnalysis.mockResolvedValue({ mode: "single", text: "Analysis text." });
    saveAiAnalysis.mockRejectedValue(new Error("DB is down"));
    const req = { userId: "user-1", body: { stocks: oneStock } };
    const res = mockRes();

    await analyzeStocks(req, res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { analysis: "Analysis text.", mode: "single", preferences },
    });
  });

  it("returns 500 with a hint about the required API keys when the AI provider call fails", async () => {
    getQualitativeAnalysis.mockRejectedValue(new Error("AI_RECOMMENDATION_API_KEY is not set"));
    const req = { userId: "user-1", body: { stocks: oneStock } };
    const res = mockRes();

    await analyzeStocks(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const [{ error }] = res.json.mock.calls[0];
    expect(error.message).toMatch(/AI_RECOMMENDATION_API_KEY/);
    expect(saveAiAnalysis).not.toHaveBeenCalled();
  });
});

describe("ai.controller - chatAboutStocks", () => {
  const baseChatBody = {
    stocks: oneStock,
    mode: "single",
    originalAnalysis: "DBS Group Holdings: solid pick.",
    preferences: { aiPersona: "balanced" },
    history: [{ role: "user", content: "Earlier question" }, { role: "assistant", content: "Earlier answer" }],
    question: "What are the biggest risks here?",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects a request missing the original analysis with 400", async () => {
    const req = { userId: "user-1", body: { ...baseChatBody, originalAnalysis: "" } };
    const res = mockRes();

    await chatAboutStocks(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getFollowUpAnswer).not.toHaveBeenCalled();
  });

  it("rejects an empty question with 400", async () => {
    const req = { userId: "user-1", body: { ...baseChatBody, question: "" } };
    const res = mockRes();

    await chatAboutStocks(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getFollowUpAnswer).not.toHaveBeenCalled();
  });

  it("rejects a mode outside single/comparison with 400", async () => {
    const req = { userId: "user-1", body: { ...baseChatBody, mode: "bulk" } };
    const res = mockRes();

    await chatAboutStocks(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getFollowUpAnswer).not.toHaveBeenCalled();
  });

  it("returns the model's reply and forwards the full context to the service", async () => {
    getFollowUpAnswer.mockResolvedValue("The main risk is rate sensitivity.");
    const req = { userId: "user-1", body: baseChatBody };
    const res = mockRes();

    await chatAboutStocks(req, res);

    expect(getFollowUpAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        stocks: oneStock,
        mode: "single",
        originalAnalysis: baseChatBody.originalAnalysis,
        question: baseChatBody.question,
      })
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { reply: "The main risk is rate sensitivity." },
    });
  });

  it("returns 500 with a hint about the required API keys when the AI provider call fails", async () => {
    getFollowUpAnswer.mockRejectedValue(new Error("AI_RECOMMENDATION_API_KEY is not set"));
    const req = { userId: "user-1", body: baseChatBody };
    const res = mockRes();

    await chatAboutStocks(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const [{ error }] = res.json.mock.calls[0];
    expect(error.message).toMatch(/AI_RECOMMENDATION_API_KEY/);
  });
});

describe("ai.controller - getAiHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns the caller's history", async () => {
    listAiAnalysisHistory.mockResolvedValue([{ id: "a1", title: "D05" }]);
    const req = { userId: "user-1" };
    const res = mockRes();

    await getAiHistory(req, res);

    expect(listAiAnalysisHistory).toHaveBeenCalledWith("user-1");
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { history: [{ id: "a1", title: "D05" }] } });
  });

  it("returns 500 when the history query fails", async () => {
    listAiAnalysisHistory.mockRejectedValue(new Error("connection lost"));
    const req = { userId: "user-1" };
    const res = mockRes();

    await getAiHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("ai.controller - updateAiHistoryEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects a body with neither title nor analysisText", async () => {
    const req = { userId: "user-1", params: { id: "a1" }, body: {} };
    const res = mockRes();

    await updateAiHistoryEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(updateAiAnalysis).not.toHaveBeenCalled();
  });

  it("maps AiAnalysisNotFoundError to 404", async () => {
    updateAiAnalysis.mockRejectedValue(new AiAnalysisNotFoundError());
    const req = { userId: "user-1", params: { id: "missing" }, body: { title: "New title" } };
    const res = mockRes();

    await updateAiHistoryEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("renames a run and returns the updated entry", async () => {
    updateAiAnalysis.mockResolvedValue({ id: "a1", title: "New title", analysisText: "text" });
    const req = { userId: "user-1", params: { id: "a1" }, body: { title: "New title" } };
    const res = mockRes();

    await updateAiHistoryEntry(req, res);

    expect(updateAiAnalysis).toHaveBeenCalledWith("user-1", "a1", { title: "New title" });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: "a1", title: "New title", analysisText: "text" },
    });
  });
});

describe("ai.controller - deleteAiHistoryEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("deletes an owned entry", async () => {
    deleteAiAnalysis.mockResolvedValue(undefined);
    const req = { userId: "user-1", params: { id: "a1" } };
    const res = mockRes();

    await deleteAiHistoryEntry(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: "a1" } });
  });

  it("maps AiAnalysisNotFoundError to 404", async () => {
    deleteAiAnalysis.mockRejectedValue(new AiAnalysisNotFoundError());
    const req = { userId: "user-1", params: { id: "missing" } };
    const res = mockRes();

    await deleteAiHistoryEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
