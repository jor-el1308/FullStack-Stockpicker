/**
 * Owner: Yong Wee (Person 1) - Auth + AI Recommendation.
 * Unit tests for aiChatStorage.js - the localStorage-backed persistence for
 * follow-up chat transcripts (see AiChatBox.jsx). Runs against jsdom's real
 * localStorage (provided by the test environment, see client/vite.config.js),
 * cleared before each test so sessions never leak between cases.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { listChatSessions, loadChatSession, saveChatSession, deleteChatSession } from "../../src/lib/aiChatStorage";

const STORAGE_KEY = "aiChatSessions";

function makeSession(overrides = {}) {
  return {
    id: "session-1",
    updatedAt: "2026-07-01T09:00:00.000Z",
    stocks: [{ exchangeCode: "SGX", stockCode: "D05", stockName: "DBS Group Holdings" }],
    mode: "single",
    originalAnalysis: "DBS Group Holdings: solid pick.",
    preferences: { aiPersona: "balanced" },
    messages: [{ role: "user", content: "What are the risks?" }, { role: "assistant", content: "Rate sensitivity." }],
    ...overrides,
  };
}

describe("aiChatStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null for a session id that was never saved", () => {
    expect(loadChatSession("missing")).toBeNull();
  });

  it("returns null when no id is given", () => {
    expect(loadChatSession(undefined)).toBeNull();
  });

  it("round-trips a saved session through loadChatSession", () => {
    const session = makeSession();
    saveChatSession(session);

    expect(loadChatSession("session-1")).toEqual(session);
  });

  it("upserts by id instead of appending a duplicate", () => {
    saveChatSession(makeSession({ updatedAt: "2026-07-01T09:00:00.000Z", messages: [] }));
    const updated = makeSession({ updatedAt: "2026-07-01T09:05:00.000Z", messages: [{ role: "user", content: "Hi" }] });
    saveChatSession(updated);

    expect(listChatSessions()).toHaveLength(1);
    expect(loadChatSession("session-1")).toEqual(updated);
  });

  it("lists sessions latest-updated first", () => {
    saveChatSession(makeSession({ id: "older", updatedAt: "2026-07-01T09:00:00.000Z" }));
    saveChatSession(makeSession({ id: "newer", updatedAt: "2026-07-03T09:00:00.000Z" }));
    saveChatSession(makeSession({ id: "middle", updatedAt: "2026-07-02T09:00:00.000Z" }));

    expect(listChatSessions().map((s) => s.id)).toEqual(["newer", "middle", "older"]);
  });

  it("deletes a session by id, leaving the others intact", () => {
    saveChatSession(makeSession({ id: "keep-me" }));
    saveChatSession(makeSession({ id: "delete-me" }));

    deleteChatSession("delete-me");

    expect(loadChatSession("delete-me")).toBeNull();
    expect(loadChatSession("keep-me")).not.toBeNull();
  });

  it("caps stored sessions at 50, dropping the oldest by insertion order", () => {
    for (let i = 0; i < 55; i++) {
      saveChatSession(makeSession({ id: `s${i}`, updatedAt: `2026-07-01T09:${String(i).padStart(2, "0")}:00.000Z` }));
    }

    const sessions = listChatSessions();
    expect(sessions).toHaveLength(50);
    // saveChatSession unshifts each new session, so the earliest-saved ones
    // (s0-s4) are the ones pushed past the cap and dropped.
    expect(sessions.some((s) => s.id === "s0")).toBe(false);
    expect(sessions.some((s) => s.id === "s54")).toBe(true);
  });

  it("falls back to an empty list when localStorage holds corrupt JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json");

    expect(listChatSessions()).toEqual([]);
  });

  it("falls back to an empty list when localStorage holds a non-array value", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: "an array" }));

    expect(listChatSessions()).toEqual([]);
  });
});
