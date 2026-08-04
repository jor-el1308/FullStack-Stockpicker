// AI preferences calls (Person 1 - Auth + AI Recommendation). Backs the
// "AI preferences" tab on the Settings page. Uses the shared `api` wrapper
// from client.js so auth headers and error handling stay consistent with
// the rest of the app.
import { api } from "./client";

// GET /api/ai/preferences — the logged-in user's saved AI preferences
// (model tier, persona, output detail level, custom instructions), or
// defaults ("flash"/"balanced"/"concise"/"") if they've never saved any.
export function getAiPreferences() {
    return api.get("/ai/preferences");
}

// PATCH /api/ai/preferences — upserts the caller's preferences. Pass only
// the fields being changed, e.g. { aiPersona: "growth" }.
export function updateAiPreferences(patch) {
    return api.patch("/ai/preferences", patch);
}
