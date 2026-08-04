/**
 * Owner: Person 1 (Yong Wee) - Auth + AI Recommendation.
 *
 * Persists each AI analysis run (ai_analysis table, migration 011/012) so
 * users can revisit past qualitative analyses on the AiHistory page instead
 * of losing them the moment they navigate away from the Screener. Also lets
 * users rename a run, edit/annotate its analysis text, or delete it
 * entirely. Kept separate from ai.service.js, which only talks to the
 * Gemini API and knows nothing about the database - same split as
 * subscription.service.js (Stripe) vs. the user-row updates that go with it.
 */
import { randomUUID } from "node:crypto";
import { pool } from "../config/db.js";

const TITLE_MAX_LENGTH = 200;

/**
 * "AAPL, MSFT, GOOG" / "AAPL, MSFT +3 more" - a sensible starting title so a
 * run is never untitled; renameable afterwards via updateAiAnalysis().
 * @param {Array<{stockCode: string}>} stocks
 */
function defaultTitleFor(stocks) {
  const codes = stocks.map((s) => s.stockCode);
  const shown = codes.slice(0, 3).join(", ");
  const extra = codes.length - 3;
  return (extra > 0 ? `${shown} +${extra} more` : shown).slice(0, TITLE_MAX_LENGTH);
}

/**
 * @param {string} userId
 * @param {Array<{exchangeCode: string, stockCode: string, stockName: string}>} stocks
 * @param {string} analysisText
 */
export async function saveAiAnalysis(userId, stocks, analysisText) {
  const id = randomUUID();
  const title = defaultTitleFor(stocks);
  await pool.query(
    `INSERT INTO ai_analysis (id, user_id, title, stocks, analysis_text) VALUES (?, ?, ?, ?, ?)`,
    [id, userId, title, JSON.stringify(stocks), analysisText]
  );
  return { id, title };
}

/**
 * @param {string} userId
 * @returns {Promise<Array<{id: string, title: string, stocks: Array<object>, analysisText: string, createdAt: string}>>}
 *   Latest-first list of past analysis runs.
 */
export async function listAiAnalysisHistory(userId) {
  const [rows] = await pool.query(
    `SELECT id, title, stocks, analysis_text AS analysisText, created_at AS createdAt
     FROM ai_analysis WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );
  // mysql2 returns JSON columns already parsed in most versions, but parse
  // defensively in case a driver/config change ever returns the raw string.
  return rows.map((row) => ({
    ...row,
    stocks: typeof row.stocks === "string" ? JSON.parse(row.stocks) : row.stocks,
  }));
}

/**
 * Sentinel error thrown by updateAiAnalysis()/deleteAiAnalysis() when the id
 * doesn't exist or doesn't belong to this user - the controller maps this to
 * a 404 rather than a generic 500.
 */
export class AiAnalysisNotFoundError extends Error {
  constructor() {
    super("AI analysis not found");
    this.name = "AiAnalysisNotFoundError";
  }
}

/**
 * Renames a run (`title`) and/or overwrites its analysis text - both are
 * user edits, not re-runs of the model. Only the fields present in `patch`
 * are touched. Scoped to `userId` so one user can never edit/see another's
 * history via a guessed id.
 *
 * @param {string} userId
 * @param {string} id
 * @param {{ title?: string, analysisText?: string }} patch
 * @returns {Promise<{id: string, title: string, analysisText: string}>}
 */
export async function updateAiAnalysis(userId, id, patch) {
  const fields = [];
  const values = [];
  if (patch.title !== undefined) {
    fields.push("title = ?");
    values.push(patch.title);
  }
  if (patch.analysisText !== undefined) {
    fields.push("analysis_text = ?");
    values.push(patch.analysisText);
  }
  if (fields.length === 0) {
    throw new Error("No fields to update");
  }

  const [result] = await pool.query(
    `UPDATE ai_analysis SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
    [...values, id, userId]
  );
  if (result.affectedRows === 0) {
    throw new AiAnalysisNotFoundError();
  }

  const [rows] = await pool.query(
    `SELECT id, title, analysis_text AS analysisText FROM ai_analysis WHERE id = ? AND user_id = ? LIMIT 1`,
    [id, userId]
  );
  return rows[0];
}

/**
 * @param {string} userId
 * @param {string} id
 */
export async function deleteAiAnalysis(userId, id) {
  const [result] = await pool.query(`DELETE FROM ai_analysis WHERE id = ? AND user_id = ?`, [id, userId]);
  if (result.affectedRows === 0) {
    throw new AiAnalysisNotFoundError();
  }
}
