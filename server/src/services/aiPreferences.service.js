/**
 * Owner: Person 1 (Yong Wee) - Auth + AI Recommendation.
 *
 * Per-user preferences (ai_preferences table, migration 013) that steer how
 * ai.service.js talks to the model: which model tier to use, the persona the
 * write-up is framed as, how much detail to include, and any free-text
 * instructions the user wants applied on top. One row per user, upserted on
 * save rather than requiring a separate "create" step.
 */
import { pool } from "../config/db.js";

// Kept here (not just in the controller) so ai.service.js can import the
// same list of valid personas/detail levels without duplicating them.
export const AI_MODEL_TIERS = ["flash", "gpt-4o-mini", "claude-haiku"];
export const AI_PERSONAS = ["balanced", "conservative", "growth", "income"];
export const AI_DETAIL_LEVELS = ["concise", "detailed"];

const DEFAULTS = {
  aiModelTier: "flash",
  aiPersona: "balanced",
  aiDetailLevel: "concise",
  customInstructions: "",
};

/**
 * @param {string} userId
 * @returns {Promise<{aiModelTier: string, aiPersona: string, aiDetailLevel: string, customInstructions: string}>}
 *   The saved row, or DEFAULTS if the user has never saved preferences yet.
 */
export async function getAiPreferences(userId) {
  const [rows] = await pool.query(
    `SELECT ai_model_tier AS aiModelTier, ai_persona AS aiPersona, ai_detail_level AS aiDetailLevel,
            custom_instructions AS customInstructions
     FROM ai_preferences WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  if (rows.length === 0) return { ...DEFAULTS };
  return { ...DEFAULTS, ...rows[0], customInstructions: rows[0].customInstructions ?? "" };
}

/**
 * Upserts the caller's preferences - only the fields present in `patch` are
 * changed, the rest keep their last-saved (or default) value.
 *
 * @param {string} userId
 * @param {{aiModelTier?: string, aiPersona?: string, aiDetailLevel?: string, customInstructions?: string}} patch
 */
export async function updateAiPreferences(userId, patch) {
  const current = await getAiPreferences(userId);
  const next = { ...current, ...patch };
  await pool.query(
    `INSERT INTO ai_preferences (user_id, ai_model_tier, ai_persona, ai_detail_level, custom_instructions)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       ai_model_tier = VALUES(ai_model_tier),
       ai_persona = VALUES(ai_persona),
       ai_detail_level = VALUES(ai_detail_level),
       custom_instructions = VALUES(custom_instructions)`,
    [userId, next.aiModelTier, next.aiPersona, next.aiDetailLevel, next.customInstructions || null]
  );
  return next;
}
