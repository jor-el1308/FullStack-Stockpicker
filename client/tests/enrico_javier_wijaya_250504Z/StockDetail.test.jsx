import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import StockDetail from "../../src/pages/StockDetail";
import { getStockDetail, getStockPrices } from "../../src/api/stocks";

// Stub the API layer.
vi.mock("../../src/api/stocks", () => ({
  getStockDetail: vi.fn(),
  getStockPrices: vi.fn(),
  // The report page also carries an "add to watchlist" bell now - stub the
  // notification calls so these tests stay focused on the detail view.
  listSavedScreens: vi.fn().mockResolvedValue([]),
  listWatchlist: vi.fn().mockResolvedValue([]),
  addToWatchlist: vi.fn(),
  removeFromWatchlist: vi.fn(),
}));

// The report page now also renders star/notes/target features backed by
// api/personal — stub them so these tests stay focused on the detail view.
vi.mock("../../src/api/personal", () => ({
  listStarred: vi.fn().mockResolvedValue([]),
  addStar: vi.fn(),
  removeStar: vi.fn(),
  getTarget: vi.fn().mockResolvedValue(null),
  setTarget: vi.fn(),
  deleteTarget: vi.fn(),
  listNotes: vi.fn().mockResolvedValue([]),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}));

// Recharts' ResponsiveContainer measures its parent, which has no size in
// jsdom, so it renders nothing and warns. Swap the chart pieces for simple
// pass-throughs - we're testing StockDetail's data handling, not Recharts.
vi.mock("recharts", () => {
  const Pass = ({ children }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Pass,
    LineChart: Pass,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    CartesianGrid: () => null,
  };
});

const detail = {
  exchangeCode: "SGX",
  stockCode: "D05",
  stockName: "DBS Group Holdings",
  latestMarketCap: 95000000000,
  fiftyTwoWeekHigh: 38.2,
  fiftyTwoWeekLow: 30.15,
  financials: [
    { year: 2022, revenue: 16500000000, profitBeforeTax: 8900000000, profitAfterTax: 8200000000, ebita: 9600000000 },
    { year: 2023, revenue: 20600000000, profitBeforeTax: 11200000000, profitAfterTax: 10300000000, ebita: 12100000000 },
  ],
  dividends: [{ year: 2023, dividendCents: 216 }],
};

// Deliberately NEWEST-FIRST, the order the /prices endpoint currently returns.
// The most recent close is 34.50 (2024-01-05); the oldest is 32.00.
const pricesNewestFirst = [
  { date: "2024-01-05", open: 34.0, high: 35.0, low: 33.0, close: 34.5, volume: 1 },
  { date: "2024-01-04", open: 33.0, high: 34.0, low: 32.0, close: 33.2, volume: 1 },
  { date: "2024-01-03", open: 32.0, high: 33.0, low: 31.0, close: 32.0, volume: 1 },
];

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/stock/SGX/D05"]}>
      <Routes>
        <Route path="/stock/:exchangeCode/:stockCode" element={<StockDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("StockDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading state before data arrives", () => {
    getStockDetail.mockReturnValue(new Promise(() => {}));
    getStockPrices.mockReturnValue(new Promise(() => {}));
    renderDetail();
    expect(screen.getByText(/loading stock/i)).toBeInTheDocument();
  });

  it("renders the stock name and identity once loaded", async () => {
    getStockDetail.mockResolvedValue(detail);
    getStockPrices.mockResolvedValue(pricesNewestFirst);
    renderDetail();

    expect(await screen.findByText("DBS Group Holdings")).toBeInTheDocument();
    expect(screen.getByText("SGX:D05")).toBeInTheDocument();
    // Fetched with the params from the route.
    expect(getStockDetail).toHaveBeenCalledWith("SGX", "D05");
    expect(getStockPrices).toHaveBeenCalledWith("SGX", "D05");
  });

  it("uses the MOST RECENT close as current price even when prices arrive newest-first", async () => {
    // Regression test for the price-ordering fix: StockDetail sorts prices
    // ascending, so the latest close (34.50 on 2024-01-05) is the current
    // price - NOT the last element of the newest-first array (32.00).
    getStockDetail.mockResolvedValue(detail);
    getStockPrices.mockResolvedValue(pricesNewestFirst);
    renderDetail();

    expect(await screen.findByText("34.50")).toBeInTheDocument();
    // Day change is computed against the previous trading day (33.20), so +1.30.
    expect(screen.getByText(/\+1\.30/)).toBeInTheDocument();
    // The oldest close must not be shown as the current price.
    expect(screen.queryByText("32.00")).not.toBeInTheDocument();
  });

  it("shows the 52-week high and low from the detail payload", async () => {
    getStockDetail.mockResolvedValue(detail);
    getStockPrices.mockResolvedValue(pricesNewestFirst);
    renderDetail();

    expect(await screen.findByText("38.20")).toBeInTheDocument();
    expect(screen.getByText("30.15")).toBeInTheDocument();
  });

  it("shows a placeholder when there is no price history", async () => {
    getStockDetail.mockResolvedValue(detail);
    getStockPrices.mockResolvedValue([]);
    renderDetail();

    expect(await screen.findByText(/no price history available/i)).toBeInTheDocument();
  });

  it("shows an error state with a back action when the stock cannot be loaded", async () => {
    getStockDetail.mockRejectedValue(new Error("Stock not found"));
    getStockPrices.mockResolvedValue([]);
    renderDetail();

    expect(await screen.findByText(/couldn't load/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to results/i })).toBeInTheDocument();
  });
});