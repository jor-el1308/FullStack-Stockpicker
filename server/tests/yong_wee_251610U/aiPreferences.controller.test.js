/**
 * Owner: Yong Wee (Person 1) - Auth + AI Recommendation.
 * Unit tests for aiPreferences.controller.js - zod validation of the
 * PATCH /api/ai/preferences body (enum fields, custom-instructions length,
 * "at least one field" rule) and error mapping. The service layer is
 * mocked so these tests never touch a real database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/services/aiPreferences.service.js", () => ({
  getAiPreferences: vi.fn(),
  updateAiPreferences: vi.fn(),
  AI_MODEL_TIERS: ["flash", "gpt-4o-mini", "claude-haiku", "deepseek-chat"],
  AI_PERSONAS: ["balanced", "conservative", "growth", "income"],
  AI_DETAIL_LEVELS: ["concise", "detailed"],
}));

import { getAiPreferences, updateAiPreferences } from "../../src/services/aiPreferences.service.js";
import { getMyAiPreferences, updateMyAiPreferences } from "../../src/controllers/aiPreferences.controller.js";

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("aiPreferences.controller - getMyAiPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns the caller's saved preferences", async () => {
    getAiPreferences.mockResolvedValue({ aiModelTier: "flash", aiPersona: "balanced" });
    const req = { userId: "user-1" };
    const res = mockRes();

    await getMyAiPreferences(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { aiModelTier: "flash", aiPersona: "balanced" },
    });
  });

  it("returns 500 when the preferences query fails", async () => {
    getAiPreferences.mockRejectedValue(new Error("connection lost"));
    const req = { userId: "user-1" };
    const res = mockRes();

    await getMyAiPreferences(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("aiPreferences.controller - updateMyAiPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects an empty body with 400", async () => {
    const req = { userId: "user-1", body: {} };
    const res = mockRes();

    await updateMyAiPreferences(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(updateAiPreferences).not.toHaveBeenCalled();
  });

  it("rejects an aiModelTier outside the allowed enum with 400", async () => {
    const req = { userId: "user-1", body: { aiModelTier: "not-a-real-model" } };
    const res = mockRes();

    await updateMyAiPreferences(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(updateAiPreferences).not.toHaveBeenCalled();
  });

  it("rejects custom instructions over 1000 characters with 400", async () => {
    const req = { userId: "user-1", body: { customInstructions: "x".repeat(1001) } };
    const res = mockRes();

    await updateMyAiPreferences(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(updateAiPreferences).not.toHaveBeenCalled();
  });

  it("passes a valid partial patch through to the service and returns the merged result", async () => {
    updateAiPreferences.mockResolvedValue({
      aiModelTier: "flash",
      aiPersona: "growth",
      aiDetailLevel: "concise",
      customInstructions: "",
    });
    const req = { userId: "user-1", body: { aiPersona: "growth" } };
    const res = mockRes();

    await updateMyAiPreferences(req, res);

    expect(updateAiPreferences).toHaveBeenCalledWith("user-1", { aiPersona: "growth" });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { aiModelTier: "flash", aiPersona: "growth", aiDetailLevel: "concise", customInstructions: "" },
    });
  });
});
