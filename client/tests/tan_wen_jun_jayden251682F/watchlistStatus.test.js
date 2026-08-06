/**
 * Owner: Person 5 - Notifications / Watchlist.
 * Unit tests for determineWatchlistStatus: a watchlisted stock "passes" when
 * it appears in the latest screener results for its saved criteria, and
 * "fails" when it has dropped out. Matching is on BOTH exchange and stock
 * code so a same-code stock on a different exchange isn't a false pass.
 */
import { describe, it, expect } from "vitest";
import { determineWatchlistStatus } from "../../src/utils/watchlistStatus";

const results = [
  { exchangeCode: "NASDAQ", stockCode: "AAPL", stockName: "Apple Inc." },
  { exchangeCode: "NYSE", stockCode: "TSM", stockName: "Taiwan Semiconductor" },
];

describe("determineWatchlistStatus", () => {
  it("returns 'pass' when the stock is in the screener results", () => {
    expect(determineWatchlistStatus("NASDAQ", "AAPL", results)).toBe("pass");
  });

  it("returns 'fail' when the stock is not in the results", () => {
    expect(determineWatchlistStatus("NASDAQ", "NVDA", results)).toBe("fail");
  });

  it("returns 'fail' when the results list is empty", () => {
    expect(determineWatchlistStatus("NASDAQ", "AAPL", [])).toBe("fail");
  });

  it("returns 'fail' when results are omitted entirely (defaults to [])", () => {
    expect(determineWatchlistStatus("NASDAQ", "AAPL")).toBe("fail");
  });

  it("requires BOTH exchange and code to match (same code, different exchange = fail)", () => {
    expect(determineWatchlistStatus("NYSE", "AAPL", results)).toBe("fail");
  });
});