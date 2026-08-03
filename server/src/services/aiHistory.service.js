/**
 * Owner: Person 1 (Yong Wee) - Auth + AI Recommendation.
 *
 * Persists each AI analysis run (ai_analysis table, migration 011) so users
 * can revisit past qualitative analyses on the AiHistory page instead of
 * losing them the moment they navigate away from the Screener. Kept
 * separate from ai.service.js, which only talks to the Gemini API and knows
 * nothing about the database - same split as subscription.service.js
 * (Stripe) vs. the user-row updates that go with it.
 */
import { randomUUID } from "node:crypto";
import { pool } from "../config/db.js";

/**
 * @param {string} userId
 * @param {Array<{exchangeCode: string, stockCode: string, stockName: string}>} stocks
 * @param {string} analysisText
 */
export async function saveAiAnalysis(userId, stocks, analysisText) {
  const id = randomUUID();
  await pool.query(`INSERT INTO ai_analysis (id, user_id, stocks, analysis_text) VALUES (?, ?, ?, ?)`, [
    id,
    userId,
    JSON.stringify(stocks),
    analysisText,
  ]);
  return { id };
}

/**
 * @param {string} userId
 * @returns {Promise<Array<{id: string, stocks: Array<object>, analysisText: string, createdAt: string}>>}
 *   Latest-first list of past analysis runs.
 */
export async function listAiAnalysisHistory(userId) {
  const [rows] = await pool.query(
    `SELECT id, stocks, analysis_text AS analysisText, created_at AS createdAt
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
