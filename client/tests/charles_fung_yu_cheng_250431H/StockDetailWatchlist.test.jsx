/**
 * Owner: Charles (250431H).
 * Unit tests for the "add to watchlist" bell on the stock report page
 * (client/src/pages/StockDetail.jsx) - the page both the Screener and the
 * Dashboard open when you click into a stock, so this is the one control that
 * covers "add the stock I'm currently looking at" from either of them.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import StockDetail from "../../src/pages/StockDetail";
import {
  getStockDetail,
  getStockPrices,
  listSavedScreens,
  listWatchlist,
  addToWatchlist,
  removeFromWatchlist,
} from "../../src/api/stocks";

vi.mock("../../src/api/stocks", () => ({
  getStockDetail: vi.fn(),
  getStockPrices: vi.fn(),
  listSavedScreens: vi.fn(),
  listWatchlist: vi.fn(),
  addToWatchlist: vi.fn(),
  removeFromWatchlist: vi.fn(),
}));
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

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/stock/SGX/D05"]}>
      <Routes>
        <Route path="/stock/:exchangeCode/:stockCode" element={<StockDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("StockDetail - add to watchlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getStockDetail.mockResolvedValue({
      exchangeCode: "SGX",
      stockCode: "D05",
      stockName: "DBS Group Holdings",
      latestMarketCap: 9.1e10,
      financials: [],
      dividends: [],
    });
    getStockPrices.mockResolvedValue([]);
    listSavedScreens.mockResolvedValue([]);
    listWatchlist.mockResolvedValue([]);
  });

  it("adds the stock currently being viewed, with no codes to retype", async () => {
    addToWatchlist.mockResolvedValue({ id: "w1" });
    renderDetail();

    fireEvent.click(await screen.findByLabelText("Add this stock to your watchlist"));
    // The stock is already identified in the dialog - "SGX:D05" also appears
    // in the page header, so scope the assertion to the dialog itself.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/SGX:D05/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to watchlist" }));

    await waitFor(() =>
      expect(addToWatchlist).toHaveBeenCalledWith(
        expect.objectContaining({ exchangeCode: "SGX", stockCode: "D05", channel: "whatsapp" })
      )
    );
    // The bell flips to the "already watching" state without a page reload.
    expect(await screen.findByLabelText("Remove this stock from your watchlist")).toBeInTheDocument();
  });

  it("shows the stock as already watched and removes it on click", async () => {
    listWatchlist.mockResolvedValue([
      { id: "w1", exchange_code: "SGX", stock_code: "D05", channel: "whatsapp" },
    ]);
    removeFromWatchlist.mockResolvedValue(undefined);
    renderDetail();

    fireEvent.click(await screen.findByLabelText("Remove this stock from your watchlist"));

    await waitFor(() => expect(removeFromWatchlist).toHaveBeenCalledWith("w1"));
    expect(await screen.findByLabelText("Add this stock to your watchlist")).toBeInTheDocument();
  });

  it("ignores a watchlist that can't be loaded and still renders the report", async () => {
    listWatchlist.mockRejectedValue(new Error("Account not activated"));
    renderDetail();

    expect(await screen.findByText("DBS Group Holdings")).toBeInTheDocument();
    expect(screen.getByLabelText("Add this stock to your watchlist")).toBeInTheDocument();
  });
});
