/**
 * Owner: Person 1 (Yong Wee) - Auth + AI Recommendation.
 * Follow-up chatbox shown under a completed "Analyze with AI" run (see
 * Screener.jsx). Every message sent to POST /api/ai/chat carries the full
 * system context - the persona/preferences and screener metrics/stocks the
 * original run used, the original analysis text, and prior turns - so the
 * model stays anchored to that same context without the server needing to
 * store any of it. The running transcript is mirrored to localStorage after
 * every exchange (see aiChatStorage.js) purely so it can be reviewed later
 * on the AI Analysis History page - this is a client-side-only prototype of
 * conversation history, not yet backed by the database.
 */
import { useEffect, useRef, useState } from "react";
import { Send, MessageCircle } from "lucide-react";
import { chatAboutStocks } from "../api/ai";
import { loadChatSession, saveChatSession } from "../lib/aiChatStorage";

const SUGGESTED_PROMPTS = ["What are the biggest risks here?", "How does this compare to sector peers?", "What would change your take?"];

/**
 * @param {{
 *   sessionId: string,
 *   stocks: Array<{exchangeCode: string, stockCode: string, stockName: string, values?: Record<string, number>}>,
 *   mode: "single" | "comparison",
 *   originalAnalysis: string,
 *   preferences: object,
 * }} props
 */
export default function AiChatBox({ sessionId, stocks, mode, originalAnalysis, preferences }) {
  const [messages, setMessages] = useState(() => loadChatSession(sessionId)?.messages ?? []);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, sending]);

  async function send(question) {
    const text = question.trim();
    if (!text || sending) return;

    const history = messages;
    setError(null);
    setSending(true);
    setInput("");
    setMessages([...history, { role: "user", content: text }]);

    try {
      const { reply } = await chatAboutStocks({ stocks, mode, originalAnalysis, preferences, history, question: text });
      const withReply = [...history, { role: "user", content: text }, { role: "assistant", content: reply }];
      setMessages(withReply);
      saveChatSession({
        id: sessionId,
        updatedAt: new Date().toISOString(),
        stocks,
        mode,
        originalAnalysis,
        preferences,
        messages: withReply,
      });
    } catch (err) {
      setError(err.message);
      setMessages(history); // roll back the optimistic user bubble so they can retry
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ marginTop: 16, borderTop: "1px solid var(--color-border)", paddingTop: 14 }}>
      <span
        style={{
          fontFamily: "var(--font-title)",
          fontWeight: 600,
          fontSize: 13,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <MessageCircle size={13} color="var(--color-special)" />
        Ask a follow-up
      </span>
      <p className="page-subtitle" style={{ marginTop: 2, marginBottom: 10 }}>
        Keeps the persona, screener metrics, and analysis above as context. Saved in this browser only for now.
      </p>

      {messages.length > 0 && (
        <div className="ai-chat-thread">
          {messages.map((m, i) => (
            <div key={i} className={`ai-chat-bubble ${m.role}`}>
              {m.content}
            </div>
          ))}
          {sending && <div className="ai-chat-bubble assistant ai-chat-typing">Thinking…</div>}
          <div ref={bottomRef} />
        </div>
      )}

      {messages.length === 0 && !sending && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {SUGGESTED_PROMPTS.map((p) => (
            <button key={p} type="button" className="chip chip-accent" style={{ cursor: "pointer" }} onClick={() => send(p)}>
              {p}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="notice notice-error" style={{ marginTop: 8, marginBottom: 8 }}>
          Couldn't send that: {error}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        style={{ display: "flex", gap: 8, marginTop: 10 }}
      >
        <input
          className="range-input"
          style={{ flex: 1, textAlign: "left" }}
          placeholder={`Ask about ${stocks.length === 1 ? stocks[0]?.stockName ?? "this stock" : "these stocks"}…`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()}>
          <Send size={14} />
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
