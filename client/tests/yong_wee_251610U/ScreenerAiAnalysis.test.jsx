/**
 * Owner: Yong Wee (Person 1) - Auth + AI Recommendation.
 * Unit tests for the "Analyze with AI" flow embedded in the Screener page
 * (client/src/pages/Screener.jsx) - shortlisting rows, the single-vs-
 * comparison response split, the 10-stock cap, and the error state. The
 * screener context, auth context, and AI API calls are all mocked so this
 * only exercises Person 1's AI-analysis logic, not Person 3's screener
 * engine or Person 2's auth/paywall.
 *
 * The trigger is a floating action button ("ai-fab") pinned to the
 * bottom-right corner, not a labelled inline button - it has no visible
 * text (just a sparkles icon + a count badge once rows are shortlisted), so
 * these tests find it by its `aria-label`, which encodes both the shortlist
 * count and the active AI model tier (from `GET /api/ai/preferences`, mocked
 * below). See the component's `ai-fab`/`aiModelLabel` for the exact strings.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Screener from "../../src/pages/Screener";
import { analyzeStocks } from "../../src/api/ai";
import { getAiPreferences } from "../../src/api/aiPreferences";
import { useScreener } from "../../src/context/ScreenerContext";
import { useAuth } from "../../src/context/AuthContext";

vi.mock("../../src/api/ai", () => ({ analyzeStocks: vi.fn(), chatAboutStocks: vi.fn() }));
vi.mock("../../src/api/aiPreferences", () => ({ getAiPreferences: vi.fn() }));
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
    // Resolves to the same tier the fab's default label already assumes
    // (see aiModelLabel's fallback in Screener.jsx), so the accessible name
    // asserted below doesn't depend on whether this promise has settled yet.
    getAiPreferences.mockResolvedValue({
      aiModelTier: "flash",
      aiPersona: "balanced",
      aiDetailLevel: "concise",
      customInstructions: "",
    });
  });

  it("disables the Analyze with AI button until at least one row is shortlisted", async () => {
    renderScreener(makeRows(2));

    // findByRole (rather than getByRole) waits out the async
    // GET /api/ai/preferences fetch the fab's tooltip/label depend on, so
    // its resolution isn't left dangling outside of act() after the test
    // makes its assertion and moves on.
    expect(await screen.findByRole("button", { name: /^analyze with ai, using/i })).toBeDisabled();
  });

  it("shortlists a row via its checkbox and enables the button with a count", async () => {
    renderScreener(makeRows(2));

    fireEvent.click(screen.getByLabelText("Select Stock 0"));

    const button = await screen.findByRole("button", { name: /analyze 1 selected stock with ai/i });
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent("1");
  });

  it("caps the shortlist at 10 stocks even if more rows are ticked", async () => {
    renderScreener(makeRows(11));

    for (let i = 0; i < 11; i++) {
      fireEvent.click(screen.getByLabelText(`Select Stock ${i}`));
    }

    expect(await screen.findByRole("button", { name: /analyze 10 selected stocks with ai/i })).toBeInTheDocument();
  });

  it("shows a single-stock write-up when exactly one stock is analyzed", async () => {
    analyzeStocks.mockResolvedValue({ analysis: "Stock 0: a promising pick.", mode: "single", preferences: {} });
    renderScreener(makeRows(1));

    fireEvent.click(screen.getByLabelText("Select Stock 0"));
    fireEvent.click(screen.getByRole("button", { name: /analyze 1 selected stock with ai/i }));

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
      preferences: {},
    });
    renderScreener(makeRows(2));

    fireEvent.click(screen.getByLabelText("Select Stock 0"));
    fireEvent.click(screen.getByLabelText("Select Stock 1"));
    fireEvent.click(screen.getByRole("button", { name: /analyze 2 selected stocks with ai/i }));

    expect(await screen.findByText("Growth outlook")).toBeInTheDocument();
    expect(screen.getByText("Stock 0 is the stronger pick.")).toBeInTheDocument();
  });

  it("shows an inline error, preserving the message, when the AI request fails", async () => {
    analyzeStocks.mockRejectedValue(new Error("AI provider returned an empty response"));
    renderScreener(makeRows(1));

    fireEvent.click(screen.getByLabelText("Select Stock 0"));
    fireEvent.click(screen.getByRole("button", { name: /analyze 1 selected stock with ai/i }));

    expect(await screen.findByText(/couldn't get ai analysis/i)).toBeInTheDocument();
    expect(screen.getByText(/AI provider returned an empty response/)).toBeInTheDocument();
  });
});
