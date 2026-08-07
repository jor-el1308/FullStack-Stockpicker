/**
 * Owner: Person 1 (Yong Wee) - Auth + AI Recommendation.
 * Shared between AiHistory.jsx (DB-backed runs) and the client-side chat
 * session cards (aiChatStorage.js) - both store a comparison run's result as
 * JSON.stringify'd text in an otherwise plain-text field (see
 * ai.controller.js), so both need the same "is this actually a comparison"
 * check on read.
 */

/**
 * @param {string} analysisText
 * @returns {{stocks: string[], criteria: Array<object>} | null}
 */
export function parseComparison(analysisText) {
  try {
    const parsed = JSON.parse(analysisText);
    if (parsed && Array.isArray(parsed.stocks) && Array.isArray(parsed.criteria)) return parsed;
  } catch {
    // Not JSON - a normal free-text write-up.
  }
  return null;
}
