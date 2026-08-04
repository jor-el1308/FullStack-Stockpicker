// AI recommendation calls (Person 1 - Auth + AI Recommendation, requirement
// doc section 6). Uses the shared `api` wrapper from client.js so auth
// headers and error handling stay consistent with the rest of the app.
import { api } from "./client";

// POST /api/ai/analyze — send up to 10 shortlisted ScreenerResultRow-shaped
// stocks, get back { analysis, mode }. A single stock gets mode: "single"
// and `analysis` is a plain-text write-up; two or more stocks get mode:
// "comparison" and `analysis` is a structured
// { stocks, criteria: [{ name, notes, winner }], summary, disclaimer }
// object for rendering a head-to-head comparison table (see
// AiComparisonTable).
export function analyzeStocks(stocks) {
    return api.post("/ai/analyze", { stocks });
}

// GET /api/ai/history — the logged-in user's past AI analysis runs
// (latest first), each with a title, the stocks that were analyzed, the
// resulting text, and when it was run. Backs the AiHistory page.
export function getAiHistory() {
    return api.get("/ai/history");
}

// PATCH /api/ai/history/:id — rename a run and/or overwrite its analysis
// text (user annotations/corrections, not a re-run of the model). Pass only
// the fields being changed, e.g. { title } or { analysisText }.
export function updateAiHistoryEntry(id, patch) {
    return api.patch(`/ai/history/${id}`, patch);
}

// DELETE /api/ai/history/:id — permanently removes one past analysis run.
export function deleteAiHistoryEntry(id) {
    return api.delete(`/ai/history/${id}`);
}
