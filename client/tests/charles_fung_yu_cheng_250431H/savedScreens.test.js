/**
 * Owner: Charles (250431H).
 * Unit tests for the shared save-a-screen helper
 * (client/src/screener/savedScreens.js), used by both the Screener page's
 * "Save Screen" and Advanced Filters' "Save as Screen".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { persistScreen, toSavedCriteria, LOCAL_SCREENS_KEY } from "../../src/screener/savedScreens";
import { saveScreen } from "../../src/api/stocks";

vi.mock("../../src/api/stocks", () => ({ saveScreen: vi.fn() }));

const USER = { id: "user-1" };

describe("toSavedCriteria", () => {
  it("keeps numeric bounds and drops blanks", () => {
    expect(toSavedCriteria([{ key: "marketCap", min: 1e9, max: "" }])).toEqual([{ key: "marketCap", min: 1e9 }]);
  });

  it("keeps a criterion that only carries a weight - it still affects ranking", () => {
    expect(toSavedCriteria([{ key: "peRatio", weight: 3 }])).toEqual([{ key: "peRatio", weight: 3 }]);
  });

  it("drops a criterion with nothing set at all", () => {
    expect(toSavedCriteria([{ key: "revenue" }, { key: "ebita", min: null, max: null, weight: 0 }])).toEqual([]);
  });

  it("coerces stringified numbers, which number inputs produce", () => {
    expect(toSavedCriteria([{ key: "marketCap", min: "5", max: "20" }])).toEqual([
      { key: "marketCap", min: 5, max: 20 },
    ]);
  });
});

describe("persistScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("saves to the account when logged in", async () => {
    saveScreen.mockResolvedValue({ id: "cs1" });
    const result = await persistScreen("  Large-cap value  ", [{ key: "marketCap", min: 1e9 }], { user: USER });

    expect(result).toEqual({ scope: "account" });
    expect(saveScreen).toHaveBeenCalledWith("Large-cap value", [{ key: "marketCap", min: 1e9 }]);
    expect(localStorage.getItem(LOCAL_SCREENS_KEY)).toBeNull();
  });

  it("falls back to this browser when logged out, so the work isn't lost", async () => {
    const result = await persistScreen("Draft", [{ key: "peRatio", max: 20 }], { user: null });

    expect(result).toEqual({ scope: "browser" });
    expect(saveScreen).not.toHaveBeenCalled();
    const stored = JSON.parse(localStorage.getItem(LOCAL_SCREENS_KEY));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ name: "Draft", local: true, criteria: [{ key: "peRatio", max: 20 }] });
  });

  it("puts the newest local screen first", async () => {
    await persistScreen("First", [{ key: "peRatio", max: 20 }], { user: null });
    await persistScreen("Second", [{ key: "peRatio", max: 10 }], { user: null });

    expect(JSON.parse(localStorage.getItem(LOCAL_SCREENS_KEY)).map((s) => s.name)).toEqual(["Second", "First"]);
  });

  it("refuses an unnamed screen", async () => {
    await expect(persistScreen("   ", [{ key: "marketCap", min: 1 }], { user: USER })).rejects.toThrow(/name/i);
    expect(saveScreen).not.toHaveBeenCalled();
  });

  it("refuses a screen with no criteria", async () => {
    await expect(persistScreen("Empty", [], { user: USER })).rejects.toThrow(/criterion/i);
    expect(saveScreen).not.toHaveBeenCalled();
  });

  it("surfaces an API failure to the caller rather than silently going local", async () => {
    saveScreen.mockRejectedValue(new Error("Account not activated"));

    await expect(persistScreen("Nope", [{ key: "marketCap", min: 1 }], { user: USER })).rejects.toThrow(
      "Account not activated"
    );
    expect(localStorage.getItem(LOCAL_SCREENS_KEY)).toBeNull();
  });
});
