/**
 * Owner: Charles (250431H).
 * Unit tests for "Save as Screen" on the Advanced Filters page
 * (client/src/pages/AdvancedFilters.jsx), which replaced the old Cancel
 * button. The point of saving from here rather than from the Screener is that
 * it keeps the criteria as they stand in the editor - you don't have to apply
 * a screen to keep it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdvancedFilters from "../../src/pages/AdvancedFilters";
import { getDistribution, saveScreen } from "../../src/api/stocks";
import { useScreener } from "../../src/context/ScreenerContext";
import { useAuth } from "../../src/context/AuthContext";

vi.mock("../../src/api/stocks", () => ({
  getDistribution: vi.fn(),
  saveScreen: vi.fn(),
}));
vi.mock("../../src/context/ScreenerContext", () => ({ useScreener: vi.fn() }));
vi.mock("../../src/context/AuthContext", () => ({ useAuth: vi.fn() }));

function renderFilters({ user = { id: "user-1" }, criteria = [{ key: "marketCap", min: 1e9 }] } = {}) {
  useAuth.mockReturnValue({ user });
  useScreener.mockReturnValue({
    criteria,
    setCriteria: vi.fn(),
    exchanges: [],
    setExchanges: vi.fn(),
    excludeSectors: [],
    setExcludeSectors: vi.fn(),
    minCompanyAgeYears: 5,
    setMinCompanyAgeYears: vi.fn(),
    runScreen: vi.fn().mockResolvedValue(null),
    loading: false,
  });
  return render(
    <MemoryRouter>
      <AdvancedFilters />
    </MemoryRouter>
  );
}

describe("Advanced Filters - Save as Screen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getDistribution.mockResolvedValue({ keys: [], rows: [], total: 0, sampled: 0 });
  });

  it("offers saving instead of cancelling", async () => {
    renderFilters();
    expect(await screen.findByRole("button", { name: /save as screen/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
  });

  it("asks for a name, then saves the criteria currently in the editor", async () => {
    saveScreen.mockResolvedValue({ id: "cs1" });
    renderFilters();

    fireEvent.click(await screen.findByRole("button", { name: /save as screen/i }));
    fireEvent.change(screen.getByLabelText(/screen name/i), { target: { value: "Large-cap value" } });
    fireEvent.click(screen.getByRole("button", { name: /^save screen$/i }));

    await waitFor(() =>
      expect(saveScreen).toHaveBeenCalledWith("Large-cap value", [{ key: "marketCap", min: 1e9 }])
    );
    expect(await screen.findByText(/Saved "Large-cap value" to your account/)).toBeInTheDocument();
  });

  it("saves edits that have not been applied yet", async () => {
    saveScreen.mockResolvedValue({ id: "cs1" });
    renderFilters();

    // Tighten the minimum in the editor without pressing Apply Filters.
    const minInput = (await screen.findAllByPlaceholderText("min"))[0];
    fireEvent.change(minInput, { target: { value: "25" } });

    fireEvent.click(screen.getByRole("button", { name: /save as screen/i }));
    fireEvent.change(screen.getByLabelText(/screen name/i), { target: { value: "Mega caps" } });
    fireEvent.click(screen.getByRole("button", { name: /^save screen$/i }));

    // 25 in the UI's $B units is 25e9 on the wire.
    await waitFor(() => expect(saveScreen).toHaveBeenCalledWith("Mega caps", [{ key: "marketCap", min: 25e9 }]));
  });

  it("keeps a logged-out user's screen in this browser", async () => {
    renderFilters({ user: null });

    fireEvent.click(await screen.findByRole("button", { name: /save as screen/i }));
    fireEvent.change(screen.getByLabelText(/screen name/i), { target: { value: "Draft" } });
    fireEvent.click(screen.getByRole("button", { name: /^save screen$/i }));

    expect(await screen.findByText(/Saved "Draft" in this browser/)).toBeInTheDocument();
    expect(saveScreen).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("localSavedScreens"))).toHaveLength(1);
  });

  it("shows the failure and keeps the name field open when the save is rejected", async () => {
    saveScreen.mockRejectedValue(new Error("Account not activated"));
    renderFilters();

    fireEvent.click(await screen.findByRole("button", { name: /save as screen/i }));
    fireEvent.change(screen.getByLabelText(/screen name/i), { target: { value: "Nope" } });
    fireEvent.click(screen.getByRole("button", { name: /^save screen$/i }));

    expect(await screen.findByText("Account not activated")).toBeInTheDocument();
    expect(screen.getByLabelText(/screen name/i)).toHaveValue("Nope");
  });

  it("won't offer to save a screen with nothing turned on", async () => {
    renderFilters({ criteria: [] });
    expect(await screen.findByRole("button", { name: /save as screen/i })).toBeDisabled();
  });
});
