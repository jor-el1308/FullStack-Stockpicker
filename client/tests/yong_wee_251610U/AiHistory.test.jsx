/**
 * Owner: Yong Wee (Person 1) - Auth + AI Recommendation.
 * Unit tests for the AiHistory page - lists past "Analyze with AI" runs,
 * lets the user rename/edit/delete them, and renders single-mode
 * (per-stock tabs) vs comparison-mode (AiComparisonTable) entries
 * correctly. The API layer is mocked so no server/database is needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AiHistory from "../../src/pages/AiHistory";
import { getAiHistory, updateAiHistoryEntry, deleteAiHistoryEntry } from "../../src/api/ai";
import { listChatSessions, deleteChatSession } from "../../src/lib/aiChatStorage";

vi.mock("../../src/api/ai", () => ({
  getAiHistory: vi.fn(),
  updateAiHistoryEntry: vi.fn(),
  deleteAiHistoryEntry: vi.fn(),
}));
// Follow-up chat sessions (AiChatBox.jsx) are stored client-side only, not in
// the DB-backed history the mocked api/ai.js module returns - see
// aiChatStorage.js. Mocked the same way so these tests control exactly which
// sessions AiHistory merges in, instead of depending on real localStorage.
vi.mock("../../src/lib/aiChatStorage", () => ({
  listChatSessions: vi.fn(),
  deleteChatSession: vi.fn(),
}));

const singleEntry = {
  id: "a1",
  title: "D05",
  stocks: [{ exchangeCode: "SGX", stockCode: "D05", stockName: "DBS Group Holdings" }],
  analysisText: "DBS Group Holdings: Solid pick with steady growth. This is not financial advice.",
  createdAt: "2026-07-01T09:00:00.000Z",
};

const twoStockEntry = {
  id: "a2",
  title: "D05, O39",
  stocks: [
    { exchangeCode: "SGX", stockCode: "D05", stockName: "DBS Group Holdings" },
    { exchangeCode: "SGX", stockCode: "O39", stockName: "OCBC Bank" },
  ],
  analysisText: "DBS Group Holdings: Write-up one.\nOCBC Bank: Write-up two.",
  createdAt: "2026-07-02T09:00:00.000Z",
};

const comparisonEntry = {
  id: "a3",
  title: "D05 vs O39",
  stocks: [
    { exchangeCode: "SGX", stockCode: "D05", stockName: "DBS Group Holdings" },
    { exchangeCode: "SGX", stockCode: "O39", stockName: "OCBC Bank" },
  ],
  analysisText: JSON.stringify({
    stocks: ["DBS Group Holdings", "OCBC Bank"],
    criteria: [{ name: "Growth outlook", notes: ["Steady growth.", "Modest growth."], winner: "DBS Group Holdings" }],
    summary: "DBS wins on growth.",
    disclaimer: "This is not financial advice.",
  }),
  createdAt: "2026-07-03T09:00:00.000Z",
};

const chatSession = {
  id: "chat-1",
  updatedAt: "2026-07-04T09:00:00.000Z",
  stocks: [{ exchangeCode: "SGX", stockCode: "D05", stockName: "DBS Group Holdings" }],
  mode: "single",
  originalAnalysis: "DBS Group Holdings: solid pick.",
  preferences: { aiPersona: "growth" },
  messages: [
    { role: "user", content: "What are the biggest risks here?" },
    { role: "assistant", content: "Rate sensitivity is the main one." },
  ],
};

describe("AiHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listChatSessions.mockReturnValue([]);
  });

  it("shows a loading message before history arrives", () => {
    getAiHistory.mockReturnValue(new Promise(() => {}));
    render(<AiHistory />);

    expect(screen.getByText(/loading history/i)).toBeInTheDocument();
  });

  it("shows an error message when the history request fails", async () => {
    getAiHistory.mockRejectedValue(new Error("Network error"));
    render(<AiHistory />);

    expect(await screen.findByText(/couldn't load ai analysis history/i)).toBeInTheDocument();
    expect(screen.getByText(/Network error/)).toBeInTheDocument();
  });

  it("shows the empty state when the user has no saved runs", async () => {
    getAiHistory.mockResolvedValue({ history: [] });
    render(<AiHistory />);

    expect(await screen.findByText(/no ai analysis yet/i)).toBeInTheDocument();
  });

  it("splits a single-mode multi-stock entry into one tab per stock", async () => {
    getAiHistory.mockResolvedValue({ history: [twoStockEntry] });
    render(<AiHistory />);

    expect(await screen.findByText("Write-up one.", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("Write-up two.", { exact: false })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "OCBC Bank" }));

    expect(await screen.findByText("Write-up two.", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("Write-up one.", { exact: false })).not.toBeInTheDocument();
  });

  it("renders a comparison-mode entry with AiComparisonTable instead of tabs", async () => {
    getAiHistory.mockResolvedValue({ history: [comparisonEntry] });
    render(<AiHistory />);

    expect(await screen.findByText("Growth outlook")).toBeInTheDocument();
    expect(screen.getByText("DBS wins on growth.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "OCBC Bank" })).not.toBeInTheDocument();
  });

  it("renames a run and reflects the new title without a full reload", async () => {
    getAiHistory.mockResolvedValue({ history: [singleEntry] });
    updateAiHistoryEntry.mockResolvedValue({ id: "a1", title: "SG Banks pick", analysisText: singleEntry.analysisText });
    render(<AiHistory />);

    fireEvent.click(await screen.findByTitle("Click to rename"));
    fireEvent.change(screen.getByDisplayValue("D05"), { target: { value: "SG Banks pick" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateAiHistoryEntry).toHaveBeenCalledWith("a1", { title: "SG Banks pick" }));
    expect(await screen.findByText("SG Banks pick")).toBeInTheDocument();
  });

  it("rejects an empty title client-side without calling the API", async () => {
    getAiHistory.mockResolvedValue({ history: [singleEntry] });
    render(<AiHistory />);

    fireEvent.click(await screen.findByTitle("Click to rename"));
    fireEvent.change(screen.getByDisplayValue("D05"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Title can't be empty.")).toBeInTheDocument();
    expect(updateAiHistoryEntry).not.toHaveBeenCalled();
  });

  it("edits the analysis write-up and shows the saved text", async () => {
    getAiHistory.mockResolvedValue({ history: [singleEntry] });
    updateAiHistoryEntry.mockResolvedValue({ id: "a1", title: "D05", analysisText: "Corrected write-up." });
    render(<AiHistory />);

    fireEvent.click(await screen.findByRole("button", { name: /edit/i }));
    fireEvent.change(screen.getByDisplayValue(singleEntry.analysisText), { target: { value: "Corrected write-up." } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(updateAiHistoryEntry).toHaveBeenCalledWith("a1", { analysisText: "Corrected write-up." })
    );
    expect(await screen.findByText("Corrected write-up.")).toBeInTheDocument();
  });

  it("deletes a run after the user confirms, removing it from the list", async () => {
    getAiHistory.mockResolvedValue({ history: [singleEntry] });
    deleteAiHistoryEntry.mockResolvedValue({ id: "a1" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AiHistory />);

    fireEvent.click(await screen.findByRole("button", { name: /delete "d05"/i }));

    await waitFor(() => expect(deleteAiHistoryEntry).toHaveBeenCalledWith("a1"));
    await waitFor(() => expect(screen.queryByText("D05")).not.toBeInTheDocument());
  });

  it("keeps the run in the list when the user cancels the delete confirmation", async () => {
    getAiHistory.mockResolvedValue({ history: [singleEntry] });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AiHistory />);

    fireEvent.click(await screen.findByRole("button", { name: /delete "d05"/i }));

    expect(deleteAiHistoryEntry).not.toHaveBeenCalled();
    expect(screen.getByText("D05")).toBeInTheDocument();
  });

  it("merges a client-side-only follow-up chat session in among the DB-backed runs", async () => {
    getAiHistory.mockResolvedValue({ history: [singleEntry] });
    listChatSessions.mockReturnValue([chatSession]);
    render(<AiHistory />);

    expect(await screen.findByText("Follow-up chat · this browser only")).toBeInTheDocument();
    expect(screen.getByText("growth persona")).toBeInTheDocument();
    expect(screen.getByText("What are the biggest risks here?")).toBeInTheDocument();
    expect(screen.getByText("Rate sensitivity is the main one.")).toBeInTheDocument();
    // The run it followed up on is still shown too - they're merged, not
    // one replacing the other.
    expect(screen.getByText("D05")).toBeInTheDocument();
  });

  it("renders a comparison-mode chat session's original analysis via AiComparisonTable", async () => {
    getAiHistory.mockResolvedValue({ history: [] });
    listChatSessions.mockReturnValue([
      {
        ...chatSession,
        mode: "comparison",
        originalAnalysis: JSON.stringify({
          stocks: ["DBS Group Holdings", "OCBC Bank"],
          criteria: [{ name: "Growth outlook", notes: ["Steady growth.", "Modest growth."], winner: "DBS Group Holdings" }],
          summary: "DBS wins on growth.",
          disclaimer: "This is not financial advice.",
        }),
      },
    ]);
    render(<AiHistory />);

    fireEvent.click(await screen.findByText("Original analysis"));

    expect(await screen.findByText("Growth outlook")).toBeInTheDocument();
    expect(screen.getByText("DBS wins on growth.")).toBeInTheDocument();
  });

  it("deletes a follow-up chat session after confirmation, removing it from the list", async () => {
    getAiHistory.mockResolvedValue({ history: [] });
    listChatSessions.mockReturnValue([chatSession]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AiHistory />);

    fireEvent.click(await screen.findByRole("button", { name: /delete conversation/i }));

    expect(deleteChatSession).toHaveBeenCalledWith("chat-1");
    expect(screen.queryByText("Follow-up chat · this browser only")).not.toBeInTheDocument();
  });

  it("keeps a follow-up chat session when the user cancels the delete confirmation", async () => {
    getAiHistory.mockResolvedValue({ history: [] });
    listChatSessions.mockReturnValue([chatSession]);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AiHistory />);

    fireEvent.click(await screen.findByRole("button", { name: /delete conversation/i }));

    expect(deleteChatSession).not.toHaveBeenCalled();
    expect(screen.getByText("Follow-up chat · this browser only")).toBeInTheDocument();
  });
});
