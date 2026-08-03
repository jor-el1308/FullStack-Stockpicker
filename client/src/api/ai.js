// AI recommendation calls (Person 1 - Auth + AI Recommendation, requirement
// doc section 6). Uses the shared `api` wrapper from client.js so auth
// headers and error handling stay consistent with the rest of the app.
import { api } from "./client";

// POST /api/ai/analyze — send up to 10 shortlisted ScreenerResultRow-shaped
// stocks, get back { analysis: string } of AI-generated qualitative
// analysis (recent context, growth outlook, reasoning per stock).
export function analyzeStocks(stocks) {
    return api.post("/ai/analyze", { stocks });
}

// GET /api/ai/history — the logged-in user's past AI analysis runs
// (latest first), each with the stocks that were analyzed, the resulting
// text, and when it was run. Backs the AiHistory page.
export function getAiHistory() {
    return api.get("/ai/history");
}
