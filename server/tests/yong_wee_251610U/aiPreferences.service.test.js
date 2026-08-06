/**
 * Owner: Yong Wee (Person 1) - Auth + AI Recommendation.
 * Unit tests for aiPreferences.service.js - the per-user AI settings that
 * steer ai.service.js's prompts. server/src/config/db.js's pool is mocked so
 * no real MySQL connection is needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config/db.js", () => ({ pool: { query: vi.fn() } }));

import { pool } from "../../src/config/db.js";
import { getAiPreferences, updateAiPreferences } from "../../src/services/aiPreferences.service.js";

describe("aiPreferences.service", () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  describe("getAiPreferences", () => {
    it("returns the built-in defaults when the user has never saved preferences", async () => {
      pool.query.mockResolvedValue([[]]);

      const prefs = await getAiPreferences("user-1");

      expect(prefs).toEqual({
        aiModelTier: "flash",
        aiPersona: "balanced",
        aiDetailLevel: "concise",
        customInstructions: "",
      });
    });

    it("returns the saved row when one exists", async () => {
      pool.query.mockResolvedValue([
        [{ aiModelTier: "claude-haiku", aiPersona: "growth", aiDetailLevel: "detailed", customInstructions: "Focus on SGX." }],
      ]);

      const prefs = await getAiPreferences("user-1");

      expect(prefs).toEqual({
        aiModelTier: "claude-haiku",
        aiPersona: "growth",
        aiDetailLevel: "detailed",
        customInstructions: "Focus on SGX.",
      });
    });

    it("normalizes a NULL custom_instructions column to an empty string", async () => {
      pool.query.mockResolvedValue([
        [{ aiModelTier: "flash", aiPersona: "balanced", aiDetailLevel: "concise", customInstructions: null }],
      ]);

      const prefs = await getAiPreferences("user-1");

      expect(prefs.customInstructions).toBe("");
    });
  });

  describe("updateAiPreferences", () => {
    it("merges the patch onto the current preferences before upserting", async () => {
      pool.query
        .mockResolvedValueOnce([
          [{ aiModelTier: "flash", aiPersona: "balanced", aiDetailLevel: "concise", customInstructions: "" }],
        ])
        .mockResolvedValueOnce([{}]);

      const next = await updateAiPreferences("user-1", { aiPersona: "income" });

      // Only aiPersona changed - everything else keeps its previously saved value.
      expect(next).toEqual({
        aiModelTier: "flash",
        aiPersona: "income",
        aiDetailLevel: "concise",
        customInstructions: "",
      });
      const [upsertSql, upsertParams] = pool.query.mock.calls[1];
      expect(upsertSql).toContain("ON DUPLICATE KEY UPDATE");
      expect(upsertParams).toEqual(["user-1", "flash", "income", "concise", null]);
    });

    it("stores empty custom instructions as NULL rather than an empty string", async () => {
      pool.query
        .mockResolvedValueOnce([
          [{ aiModelTier: "flash", aiPersona: "balanced", aiDetailLevel: "concise", customInstructions: "old note" }],
        ])
        .mockResolvedValueOnce([{}]);

      await updateAiPreferences("user-1", { customInstructions: "" });

      const [, upsertParams] = pool.query.mock.calls[1];
      expect(upsertParams[4]).toBeNull();
    });
  });
});
