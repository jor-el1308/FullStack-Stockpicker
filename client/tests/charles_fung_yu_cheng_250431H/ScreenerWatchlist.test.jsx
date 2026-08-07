/**
 * Owner: Charles (250431H).
 * Unit tests for adding a screener result straight to the watchlist
 * (the bell column in client/src/components/ResultsTable.jsx, wired up in
 * client/src/pages/Screener.jsx).
 *
 * The screener context, auth context and AI calls are mocked, so this only
 * covers the watchlist round trip: open the dialog from a row, POST the
 * stock's own identity, and take it off again from the same button.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Screener from "../../src/pages/Screener";
import { addToWatchlist, listSavedScreens, listWatchlist, removeFromWatchlist } from "../../src/api/stocks";
import { getAiPreferences } from "../../src/api/aiPreferences";
import { useScreener } from "../../src/context/ScreenerContext";
import { useAuth } from "../../src/context/AuthContext";

vi.mock("../../src/api/ai", () => ({ analyzeStocks: vi.fn(), chatAboutStocks: vi.fn() }));
vi.mock("../../src/api/aiPreferences", () => ({ getAiPreferences: vi.fn() }));
vi.mock("../../src/api/stocks", () => ({
  saveScreen: vi.fn(),
  listSavedScreens: vi.fn(),
  listWatchlist: vi.fn(),
  addToWatchlist: vi.fn(),
  removeFromWatchlist: vi.fn(),
}));
vi.mock("../../src/context/ScreenerContext", () => ({ useScreener: vi.fn() }));
vi.mock("../../src/context/AuthContext", () => ({ useAuth: vi.fn() }));

const ROWS = [
  { exchangeCode: "SGX", stockCode: "D05", stockName: "DBS Group", values: { marketCap: 9e10 } },
  { exchangeCode: "SGX", stockCode: "O39", stockName: "OCBC Bank", values: { marketCap: 6e10 } },
];

function renderScreener() {
  useScreener.mockReturnValue({
    criteria: [],
    criteriaReady: true,
    exchanges: [],
    excludeSectors: [],
    minCompanyAgeYears: 5,
    results: ROWS,
    loading: false,
    error: null,
    lastRunAt: null,
    runScreen: vi.fn(),
  });
  useAuth.mockReturnValue({ user: { id: "user-1" } });

  return render(
    <MemoryRouter>
      <Screener />
    </MemoryRouter>
  );
}

describe("Screener - add to watchlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getAiPreferences.mockResolvedValue({ aiModelTier: "flash", aiPersona: "balanced", aiDetailLevel: "concise" });
    listWatchlist.mockResolvedValue([]);
    listSavedScreens.mockResolvedValue([]);
  });

  it("shows a watchlist button for every result row", async () => {
    renderScreener();
    expect(await screen.findByLabelText("Add DBS Group to watchlist")).toBeInTheDocument();
    expect(screen.getByLabelText("Add OCBC Bank to watchlist")).toBeInTheDocument();
  });

  it("adds the clicked row's own stock, without retyping its code", async () => {
    addToWatchlist.mockResolvedValue({ id: "w1" });
    renderScreener();

    fireEvent.click(await screen.findByLabelText("Add DBS Group to watchlist"));
    // The dialog is prefilled with the row, so only the alert settings remain.
    expect(await screen.findByText(/SGX:D05/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add to watchlist" }));

    await waitFor(() =>
      expect(addToWatchlist).toHaveBeenCalledWith(
        expect.objectContaining({ exchangeCode: "SGX", stockCode: "D05", channel: "whatsapp" })
      )
    );
  });

  it("marks a stock already on the watchlist and removes it on a second click", async () => {
    listWatchlist.mockResolvedValue([
      { id: "w1", exchange_code: "SGX", stock_code: "D05", stock_name: "DBS Group", channel: "whatsapp" },
    ]);
    removeFromWatchlist.mockResolvedValue(undefined);
    renderScreener();

    const bell = await screen.findByLabelText("Remove DBS Group from watchlist");
    fireEvent.click(bell);

    await waitFor(() => expect(removeFromWatchlist).toHaveBeenCalledWith("w1"));
    expect(addToWatchlist).not.toHaveBeenCalled();
    expect(await screen.findByLabelText("Add DBS Group to watchlist")).toBeInTheDocument();
  });

  it("keeps the results usable when the watchlist can't be loaded", async () => {
    listWatchlist.mockRejectedValue(new Error("Account not activated"));
    renderScreener();

    expect(await screen.findByLabelText("Add DBS Group to watchlist")).toBeInTheDocument();
    expect(screen.getByText("DBS Group")).toBeInTheDocument();
  });

  it("surfaces a failed add inside the dialog instead of closing it", async () => {
    addToWatchlist.mockRejectedValue(new Error("Unknown stock or saved criteria set"));
    renderScreener();

    fireEvent.click(await screen.findByLabelText("Add DBS Group to watchlist"));
    fireEvent.click(screen.getByRole("button", { name: "Add to watchlist" }));

    expect(await screen.findByText("Unknown stock or saved criteria set")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
