/**
 * Owner: Yong Wee (Person 1) - Auth + AI Recommendation.
 * Unit tests for aiHistory.service.js - persistence/CRUD for saved AI
 * analysis runs. server/src/config/db.js's pool is mocked so no real MySQL
 * connection is needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:crypto", () => ({ randomUUID: () => "test-uuid-1234" }));
vi.mock("../../src/config/db.js", () => ({ pool: { query: vi.fn() } }));

import { pool } from "../../src/config/db.js";
import {
  saveAiAnalysis,
  listAiAnalysisHistory,
  updateAiAnalysis,
  deleteAiAnalysis,
  AiAnalysisNotFoundError,
} from "../../src/services/aiHistory.service.js";

describe("aiHistory.service", () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  describe("saveAiAnalysis", () => {
    it("titles a run of three or fewer stocks by listing every stock code", async () => {
      pool.query.mockResolvedValue([{}]);
      const stocks = [{ stockCode: "D05" }, { stockCode: "O39" }, { stockCode: "U11" }];

      const { id, title } = await saveAiAnalysis("user-1", stocks, "write-up text");

      expect(id).toBe("test-uuid-1234");
      expect(title).toBe("D05, O39, U11");
    });

    it("titles a run of more than three stocks as 'first three +N more'", async () => {
      pool.query.mockResolvedValue([{}]);
      const stocks = [
        { stockCode: "D05" },
        { stockCode: "O39" },
        { stockCode: "U11" },
        { stockCode: "C38U" },
        { stockCode: "Z74" },
      ];

      const { title } = await saveAiAnalysis("user-1", stocks, "write-up text");

      expect(title).toBe("D05, O39, U11 +2 more");
    });

    it("inserts the shortlisted stocks as a JSON string alongside the raw analysis text", async () => {
      pool.query.mockResolvedValue([{}]);
      const stocks = [{ stockCode: "D05", stockName: "DBS Group Holdings" }];

      await saveAiAnalysis("user-1", stocks, "some analysis");

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO ai_analysis"), [
        "test-uuid-1234",
        "user-1",
        "D05",
        JSON.stringify(stocks),
        "some analysis",
      ]);
    });
  });

  describe("listAiAnalysisHistory", () => {
    it("parses the stocks column when the driver returns it as a raw JSON string", async () => {
      pool.query.mockResolvedValue([
        [
          {
            id: "a1",
            title: "D05",
            stocks: JSON.stringify([{ stockCode: "D05" }]),
            analysisText: "text",
            createdAt: "2026-07-01T00:00:00.000Z",
          },
        ],
      ]);

      const history = await listAiAnalysisHistory("user-1");

      expect(history[0].stocks).toEqual([{ stockCode: "D05" }]);
    });

    it("leaves the stocks column untouched when the driver already parsed the JSON column", async () => {
      pool.query.mockResolvedValue([
        [
          {
            id: "a1",
            title: "D05",
            stocks: [{ stockCode: "D05" }],
            analysisText: "text",
            createdAt: "2026-07-01T00:00:00.000Z",
          },
        ],
      ]);

      const history = await listAiAnalysisHistory("user-1");

      expect(history[0].stocks).toEqual([{ stockCode: "D05" }]);
    });
  });

  describe("updateAiAnalysis", () => {
    it("only updates the fields present in the patch, scoped to the owning user", async () => {
      pool.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ id: "a1", title: "New title", analysisText: "old text" }]]);

      const updated = await updateAiAnalysis("user-1", "a1", { title: "New title" });

      const [updateSql, updateParams] = pool.query.mock.calls[0];
      expect(updateSql).toContain("title = ?");
      expect(updateSql).not.toContain("analysis_text = ?");
      expect(updateParams).toEqual(["New title", "a1", "user-1"]);
      expect(updated.title).toBe("New title");
    });

    it("throws AiAnalysisNotFoundError when no row matches the id/user pair", async () => {
      pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

      await expect(updateAiAnalysis("user-1", "missing-id", { title: "X" })).rejects.toThrow(
        AiAnalysisNotFoundError
      );
    });
  });

  describe("deleteAiAnalysis", () => {
    it("resolves without error when the row is deleted", async () => {
      pool.query.mockResolvedValue([{ affectedRows: 1 }]);

      await expect(deleteAiAnalysis("user-1", "a1")).resolves.toBeUndefined();
    });

    it("throws AiAnalysisNotFoundError when the row doesn't belong to this user (or doesn't exist)", async () => {
      pool.query.mockResolvedValue([{ affectedRows: 0 }]);

      await expect(deleteAiAnalysis("user-1", "someone-elses-id")).rejects.toThrow(AiAnalysisNotFoundError);
    });
  });
});
