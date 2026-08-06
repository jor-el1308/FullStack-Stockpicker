/**
 * Owner: Yong Wee (Person 1) - Auth + AI Recommendation.
 * Unit tests for the "Analyze with AI" flow embedded in the Screener page
 * (client/src/pages/Screener.jsx) - shortlisting rows, the single-vs-
 * comparison response split, the 10-stock cap, and the error state. The
 * screener context, auth context, and AI API call are all mocked so this
 * only exercises Person 1's AI-analysis logic, not Person 3's screener
 * engine or Person 2's auth/paywall.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Screener from "../../src/pages/Screener";
import { analyzeStocks } from "../../src/api/ai";
import { useScreener } from "../../src/context/ScreenerContext";
import { useAuth } from "../../src/context/AuthContext";

vi.mock("../../src/api/ai", () => ({ analyzeStocks: vi.fn() }));
vi.mock("../../src/api/stocks", () => ({ saveScreen: vi.fn() }));
vi.mock("../../src/context/ScreenerContext", () => ({ useScreener: vi.fn() }));
vi.mock("../../src/context/AuthContext", () => ({ useAuth: vi.fn() }));

function makeRows(count) {
  return Array.from({ length: count }, (_, i) => ({
    exchangeCode: "SGX",
    stockCode: `S${i}`,
    stockName: `Stock ${i}`,
    values: { marketCap: 1000000000 * (i + 1) },
  }));
}

function renderScreener(rows) {
  useScreener.mockReturnValue({
    criteria: [],
    criteriaReady: true,
    exchanges: [],
    excludeSectors: [],
    minCompanyAgeYears: 5,
    results: rows,
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

describe("Screener - Analyze with AI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables the Analyze with AI button until at least one row is shortlisted", () => {
    renderScreener(makeRows(2));

    expect(screen.getByRole("button", { name: /analyze with ai/i })).toBeDisabled();
  });

  it("shortlists a row via its checkbox and enables the button with a count", () => {
    renderScreener(makeRows(2));

    fireEvent.click(screen.getByLabelText("Select Stock 0"));

    const button = screen.getByRole("button", { name: /analyze with ai \(1\)/i });
    expect(button).toBeEnabled();
  });

  it("caps the shortlist at 10 stocks even if more rows are ticked", () => {
    renderScreener(makeRows(11));

    for (let i = 0; i < 11; i++) {
      fireEvent.click(screen.getByLabelText(`Select Stock ${i}`));
    }

    expect(screen.getByRole("button", { name: /analyze with ai \(10\)/i })).toBeInTheDocument();
  });

  it("shows a single-stock write-up when exactly one stock is analyzed", async () => {
    analyzeStocks.mockResolvedValue({ analysis: "Stock 0: a promising pick.", mode: "single" });
    renderScreener(makeRows(1));

    fireEvent.click(screen.getByLabelText("Select Stock 0"));
    fireEvent.click(screen.getByRole("button", { name: /analyze with ai \(1\)/i }));

    expect(await screen.findByText("Stock 0: a promising pick.")).toBeInTheDocument();
    expect(analyzeStocks).toHaveBeenCalledWith([
      expect.objectContaining({ exchangeCode: "SGX", stockCode: "S0", stockName: "Stock 0" }),
    ]);
  });

  it("shows a head-to-head comparison table when two or more stocks are analyzed", async () => {
    analyzeStocks.mockResolvedValue({
      analysis: {
        stocks: ["Stock 0", "Stock 1"],
        criteria: [{ name: "Growth outlook", notes: ["Faster growth.", "Slower growth."], winner: "Stock 0" }],
        summary: "Stock 0 is the stronger pick.",
        disclaimer: "This is not financial advice.",
      },
      mode: "comparison",
    });
    renderScreener(makeRows(2));

    fireEvent.click(screen.getByLabelText("Select Stock 0"));
    fireEvent.click(screen.getByLabelText("Select Stock 1"));
    fireEvent.click(screen.getByRole("button", { name: /analyze with ai \(2\)/i }));

    expect(await screen.findByText("Growth outlook")).toBeInTheDocument();
    expect(screen.getByText("Stock 0 is the stronger pick.")).toBeInTheDocument();
  });

  it("shows an inline error, preserving the message, when the AI request fails", async () => {
    analyzeStocks.mockRejectedValue(new Error("AI provider returned an empty response"));
    renderScreener(makeRows(1));

    fireEvent.click(screen.getByLabelText("Select Stock 0"));
    fireEvent.click(screen.getByRole("button", { name: /analyze with ai \(1\)/i }));

    expect(await screen.findByText(/couldn't get ai analysis/i)).toBeInTheDocument();
    expect(screen.getByText(/AI provider returned an empty response/)).toBeInTheDocument();
  });
});
