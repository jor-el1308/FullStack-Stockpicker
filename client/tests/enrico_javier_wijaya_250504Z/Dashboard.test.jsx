import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "../../src/pages/Dashboard";
import { getStocks } from "../../src/api/stocks";

// Stub the API layer so the Dashboard's data fetching is deterministic and
// no real network call happens.
vi.mock("../../src/api/stocks", () => ({ getStocks: vi.fn() }));

// StarredStocks (rendered by Dashboard) reads from api/personal; stub it so
// the dashboard tests stay focused on the screener results.
vi.mock("../../src/api/personal", () => ({
  listStarred: vi.fn().mockResolvedValue([]),
  addStar: vi.fn(),
  removeStar: vi.fn(),
}));

function renderDashboard() {
  // Dashboard uses useNavigate(), so it must be inside a Router.
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

const rows = [
  { exchangeCode: "SGX", stockCode: "D05", stockName: "DBS Group Holdings", values: { marketCap: 95000000000 } },
];

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading message before results arrive", () => {
    // Never resolves during this test - the component stays in its loading state.
    getStocks.mockReturnValue(new Promise(() => {}));
    renderDashboard();
    expect(screen.getByText(/loading results/i)).toBeInTheDocument();
  });

  it("renders the results table once the screener responds", async () => {
    getStocks.mockResolvedValue(rows);
    renderDashboard();

    expect(await screen.findByText("DBS Group Holdings")).toBeInTheDocument();
    expect(getStocks).toHaveBeenCalledTimes(1);
    // Loading message is gone once results render.
    expect(screen.queryByText(/loading results/i)).not.toBeInTheDocument();
  });

  it("shows an error message when the screener request fails", async () => {
    getStocks.mockRejectedValue(new Error("Screener query failed"));
    renderDashboard();

    expect(await screen.findByText(/couldn't load screener results/i)).toBeInTheDocument();
    expect(screen.getByText(/Screener query failed/)).toBeInTheDocument();
  });

  it("shows the empty state when no stocks match", async () => {
    getStocks.mockResolvedValue([]);
    renderDashboard();

    expect(await screen.findByText(/no results yet/i)).toBeInTheDocument();
  });
});