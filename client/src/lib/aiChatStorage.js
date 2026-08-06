/**
 * Owner: Person 1 (Yong Wee) - Auth + AI Recommendation.
 * Client-side-only storage for follow-up chat transcripts (see AiChatBox.jsx
 * and AiHistory.jsx). Each session snapshots the system context an "Analyze
 * with AI" run was produced with - the shortlisted stocks/screener metrics,
 * the persona/model preferences it used, and the original analysis text -
 * alongside the running message thread, so follow-up questions (and
 * re-reading past ones on the AI History page) stay anchored to that same
 * context. Kept in localStorage rather than the database for now, so this
 * can be tried out before committing to a schema/migration for persisted
 * conversations (mirrors the localStorage fallback Screener.jsx already uses
 * for saved screens when logged out).
 */
const STORAGE_KEY = "aiChatSessions";
const MAX_SESSIONS = 50; // keeps localStorage bounded; oldest sessions drop off first

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
}

/**
 * @typedef {{
 *   id: string,
 *   updatedAt: string,
 *   stocks: Array<{exchangeCode: string, stockCode: string, stockName: string, values?: Record<string, number>}>,
 *   mode: "single" | "comparison",
 *   originalAnalysis: string,
 *   preferences: {aiPersona?: string, aiDetailLevel?: string, aiModelTier?: string, customInstructions?: string},
 *   messages: Array<{role: "user" | "assistant", content: string}>,
 * }} AiChatSession
 */

/** @returns {AiChatSession[]} Latest-updated first. */
export function listChatSessions() {
  return readAll().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/** @returns {AiChatSession | null} */
export function loadChatSession(id) {
  if (!id) return null;
  return readAll().find((s) => s.id === id) ?? null;
}

/** Upserts a session by id. @param {AiChatSession} session */
export function saveChatSession(session) {
  const sessions = readAll().filter((s) => s.id !== session.id);
  sessions.unshift(session);
  writeAll(sessions);
}

export function deleteChatSession(id) {
  writeAll(readAll().filter((s) => s.id !== id));
}
