/**
 * Owner: Yong Wee (Person 1) - Auth + AI Recommendation.
 * Unit tests for AiChatBox.jsx - the follow-up chat widget shown under a
 * completed "Analyze with AI" run (see Screener.jsx). The API call and the
 * localStorage-backed session persistence (aiChatStorage.js) are both mocked
 * so this only exercises the component's own send/optimistic-update/rollback
 * logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AiChatBox from "../../src/components/AiChatBox";
import { chatAboutStocks } from "../../src/api/ai";
import { loadChatSession, saveChatSession } from "../../src/lib/aiChatStorage";

vi.mock("../../src/api/ai", () => ({ chatAboutStocks: vi.fn() }));
vi.mock("../../src/lib/aiChatStorage", () => ({
  loadChatSession: vi.fn(),
  saveChatSession: vi.fn(),
}));

const stocks = [{ exchangeCode: "SGX", stockCode: "D05", stockName: "DBS Group Holdings" }];

function renderChatBox(overrides = {}) {
  return render(
    <AiChatBox
      sessionId="session-1"
      stocks={stocks}
      mode="single"
      originalAnalysis="DBS Group Holdings: solid pick."
      preferences={{ aiPersona: "balanced" }}
      {...overrides}
    />
  );
}

describe("AiChatBox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadChatSession.mockReturnValue(null);
    // jsdom doesn't implement scrollIntoView - the component calls it on
    // every message-list update purely as a UX nicety (scroll to the
    // latest bubble), unrelated to what these tests verify.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("shows suggested prompts and no thread when there's no prior session", () => {
    renderChatBox();

    expect(screen.getByText("What are the biggest risks here?")).toBeInTheDocument();
    expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
  });

  it("loads an existing session's messages instead of the suggested prompts", () => {
    loadChatSession.mockReturnValue({
      id: "session-1",
      messages: [{ role: "user", content: "Old question" }, { role: "assistant", content: "Old answer" }],
    });

    renderChatBox();

    expect(screen.getByText("Old question")).toBeInTheDocument();
    expect(screen.getByText("Old answer")).toBeInTheDocument();
    expect(screen.queryByText("What are the biggest risks here?")).not.toBeInTheDocument();
  });

  it("clicking a suggested prompt sends it and renders both bubbles on success", async () => {
    chatAboutStocks.mockResolvedValue({ reply: "Rate sensitivity is the main risk." });
    renderChatBox();

    fireEvent.click(screen.getByText("What are the biggest risks here?"));

    expect(await screen.findByText("What are the biggest risks here?", { selector: ".ai-chat-bubble" })).toBeInTheDocument();
    expect(await screen.findByText("Rate sensitivity is the main risk.")).toBeInTheDocument();
    expect(chatAboutStocks).toHaveBeenCalledWith(
      expect.objectContaining({
        stocks,
        mode: "single",
        originalAnalysis: "DBS Group Holdings: solid pick.",
        question: "What are the biggest risks here?",
      })
    );
  });

  it("typing a question and submitting sends it, disables the input while sending, and clears it", async () => {
    let resolveReply;
    chatAboutStocks.mockReturnValue(new Promise((resolve) => { resolveReply = resolve; }));
    renderChatBox();

    const input = screen.getByPlaceholderText(/ask about/i);
    fireEvent.change(input, { target: { value: "How does this compare to peers?" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(input).toHaveValue("");
    expect(input).toBeDisabled();
    expect(screen.getByText("Thinking…")).toBeInTheDocument();

    resolveReply({ reply: "Broadly in line with sector peers." });
    expect(await screen.findByText("Broadly in line with sector peers.")).toBeInTheDocument();
    expect(input).not.toBeDisabled();
  });

  it("saves the updated session to localStorage after a successful reply", async () => {
    chatAboutStocks.mockResolvedValue({ reply: "Reply text." });
    renderChatBox();

    fireEvent.click(screen.getByText("What are the biggest risks here?"));

    await waitFor(() => expect(saveChatSession).toHaveBeenCalled());
    const saved = saveChatSession.mock.calls[0][0];
    expect(saved.id).toBe("session-1");
    expect(saved.messages).toEqual([
      { role: "user", content: "What are the biggest risks here?" },
      { role: "assistant", content: "Reply text." },
    ]);
  });

  it("rolls back the optimistic user bubble and restores the input on failure", async () => {
    chatAboutStocks.mockRejectedValue(new Error("AI provider returned an empty response"));
    renderChatBox();

    const input = screen.getByPlaceholderText(/ask about/i);
    fireEvent.change(input, { target: { value: "What would change your take?" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText(/couldn't send that/i)).toBeInTheDocument();
    expect(screen.getByText(/AI provider returned an empty response/)).toBeInTheDocument();
    expect(screen.queryByText("What would change your take?", { selector: ".ai-chat-bubble" })).not.toBeInTheDocument();
    expect(input).toHaveValue("What would change your take?");
    expect(saveChatSession).not.toHaveBeenCalled();
  });

  it("does not send an empty or whitespace-only question", () => {
    renderChatBox();

    const input = screen.getByPlaceholderText(/ask about/i);
    fireEvent.change(input, { target: { value: "   " } });

    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    fireEvent.submit(input.closest("form"));

    expect(chatAboutStocks).not.toHaveBeenCalled();
  });
});
