# Test Cases — AI Stock Analysis

**Owner:** Yong Wee (Person 1) · **Framework:** Vitest (backend: Node environment + mocked MySQL pool/fetch; frontend: Vitest + React Testing Library / jsdom)

Backend and frontend unit tests for the AI qualitative-analysis feature: `ai.service.js` (prompt building + Gemini/OpenRouter calls), `aiHistory.service.js` / `aiPreferences.service.js` (persistence), `ai.controller.js` / `aiPreferences.controller.js` (validation + HTTP mapping), and the React side (`AiComparisonTable`, `AiHistory`, the "Analyze with AI" flow on `Screener`, and the `api/ai.js` / `api/aiPreferences.js` clients). **All 72 tests pass** (44 backend + 28 frontend).

## How to run

Backend, from `server/`:

```
npm install     # first time
npm test        # runs server/tests/**/*.test.js once (vitest run)
```

Frontend, from `client/`:

```
npm install     # first time — installs vitest + testing-library
npm test        # runs client/tests/**/*.test.jsx once
npm run test:watch   # re-runs on change
```

Or from the repo root: `npm test --workspace=server` / `npm test --workspace=client`. Test files live in `server/tests/yong_wee_251610U/` and `client/tests/yong_wee_251610U/`. No real database, network call, or AI API key is needed for any of these — the MySQL pool, `fetch`, and the API-client modules are all mocked (see Notes).

---

## Backend tests

### `ai.service.js` (`ai.service.test.js`) — 11 cases

The core "send shortlisted stocks to an LLM" logic. `global.fetch` is stubbed so no real provider is called.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | single-stock write-up | Exactly one stock returns free text with markdown stripped | `mode: "single"`; result contains the stock name; no `*`, `#`, `_`, `` ` `` survive |
| 2 | Gemini request shape | Single-stock calls hit Gemini's endpoint with the API key as a query param | URL contains `generativelanguage.googleapis.com` and `key=test-gemini-key` |
| 3 | persona/custom instructions in prompt | The selected persona and custom instructions are woven into the request body sent to the model | Prompt text contains "growth-focused financial analyst" and the custom instructions string |
| 4 | comparison mode | Two or more stocks return a structured comparison, tolerating a markdown code-fence wrapper | `mode: "comparison"`; `stocks`/`criteria` parsed correctly; correct `winner` |
| 5 | invalid comparison response (no JSON) | A response with no `{...}` at all is rejected | Rejects with `/not valid JSON/` |
| 6 | invalid comparison response (missing fields) | JSON present but missing `stocks`/`criteria` | Rejects with `/missing the expected/` |
| 7 | missing Gemini key | `AI_RECOMMENDATION_API_KEY` unset for the default tier | Rejects with `/AI_RECOMMENDATION_API_KEY is not set/`; `fetch` never called |
| 8 | Gemini HTTP error | Provider responds non-2xx | Rejects with `/Gemini request failed \(429\)/` |
| 9 | empty model response | Provider returns no candidates/text | Rejects with `/empty response/` |
| 10 | OpenRouter routing | A non-`flash` tier (`gpt-4o-mini`) routes through OpenRouter with a bearer token | URL contains `openrouter.ai`; `Authorization: Bearer test-openrouter-key` |
| 11 | missing OpenRouter key | `OPENROUTER_API_KEY` unset for a non-flash tier | Rejects with `/OPENROUTER_API_KEY is not set/` |

### `aiHistory.service.js` (`aiHistory.service.test.js`) — 9 cases

CRUD against the `ai_analysis` table. `server/src/config/db.js`'s `pool` is mocked.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | auto-title, ≤3 stocks | `saveAiAnalysis` titles a run by listing every stock code | Title `"D05, O39, U11"` |
| 2 | auto-title, >3 stocks | Title truncates to the first three plus a count | Title `"D05, O39, U11 +2 more"` |
| 3 | insert shape | `stocks` is stored as a JSON string alongside the raw analysis text | `pool.query` called with `INSERT INTO ai_analysis` and the exact param tuple |
| 4 | history JSON parsing (string) | `listAiAnalysisHistory` defensively parses `stocks` when the driver returns a raw JSON string | Returned `stocks` is a real array |
| 5 | history JSON parsing (already parsed) | Same, when the driver already parsed the JSON column | Returned `stocks` is unchanged |
| 6 | partial update | `updateAiAnalysis` only touches the fields present in the patch, scoped to `(id, user_id)` | SQL contains `title = ?`, not `analysis_text = ?`; correct bound params |
| 7 | update not found | No row matches the `(id, userId)` pair | Rejects with `AiAnalysisNotFoundError` |
| 8 | delete success | A matching row is removed | Resolves with no error |
| 9 | delete not found | Row doesn't exist / isn't owned by this user | Rejects with `AiAnalysisNotFoundError` |

### `aiPreferences.service.js` (`aiPreferences.service.test.js`) — 5 cases

Per-user settings (`ai_preferences` table, one row per user). `pool` is mocked.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | defaults | `getAiPreferences` with no saved row | Returns the built-in defaults (`flash`/`balanced`/`concise`/`""`) |
| 2 | saved row | A row exists | Returns it as-is |
| 3 | NULL normalization | `custom_instructions` is `NULL` in the DB | Returned as `""`, not `null` |
| 4 | merge-then-upsert | `updateAiPreferences` merges a partial patch onto the current row before upserting | Only the patched field changes; `ON DUPLICATE KEY UPDATE` SQL used with the full merged param list |
| 5 | empty custom instructions stored as NULL | Patching `customInstructions: ""` | Upsert param is `null`, not `""` |

### `ai.controller.js` (`ai.controller.test.js`) — 13 cases

Request validation, the single-vs-comparison response shape, best-effort history persistence, and 400/404/500 error mapping. The service layer is mocked.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | empty `stocks` array | `POST /analyze` validation | `400`; AI service never called |
| 2 | >10 stocks | `POST /analyze` validation | `400`; AI service never called |
| 3 | single-stock success | Happy path | `200` with `{analysis, mode:"single"}`; history saved with the raw text |
| 4 | comparison success | Happy path | `200` with `analysis` as an **object**; history saved as its **JSON string** |
| 5 | best-effort persistence | History save fails after a successful model call | Still returns `200` with the analysis (failure only logged) |
| 6 | AI provider failure | `getQualitativeAnalysis` rejects | `500` with a message naming the required API key |
| 7 | get history success | `GET /history` happy path | `200` with `{history}` |
| 8 | get history failure | Service throws | `500` |
| 9 | update with neither field | `PATCH /history/:id` validation | `400`; service never called |
| 10 | update not found | Service throws `AiAnalysisNotFoundError` | `404` |
| 11 | update success | Happy path | `200` with the updated entry; service called with `(userId, id, patch)` |
| 12 | delete success | Happy path | `200` with `{id}` |
| 13 | delete not found | Service throws `AiAnalysisNotFoundError` | `404` |

### `aiPreferences.controller.js` (`aiPreferences.controller.test.js`) — 6 cases

Zod validation of `PATCH /api/ai/preferences` (enum fields, length limit, "at least one field" rule). The service layer is mocked.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | get success | `GET /preferences` happy path | `200` with the saved preferences |
| 2 | get failure | Service throws | `500` |
| 3 | empty body | `PATCH` with no fields | `400`; service never called |
| 4 | invalid enum | `aiModelTier` outside the allowed list | `400`; service never called |
| 5 | over-length custom instructions | >1000 characters | `400`; service never called |
| 6 | valid partial patch | One field changed | Service called with exactly that field; `200` with the merged result |

---

## Frontend tests

### `AiComparisonTable` (`AiComparisonTable.test.jsx`) — 6 cases

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | grid shape | One column per stock, one row per criterion | Both stock names as column headers; both criterion names and notes render |
| 2 | winner highlight | The winning stock's cell gets the highlight class | Winning cell has `ai-comparison-winner`; losing cell doesn't |
| 3 | tie handling | A criterion the model called `"Tie"` | No cell is highlighted |
| 4 | summary/disclaimer | Optional trailing text | Both render when present |
| 5 | missing note fallback | A stock has no note for a criterion (`notes[j]` undefined) | Renders `"—"` |
| 6 | empty state | No stocks or no criteria | Renders nothing (`null`) |

### `AiHistory` (`AiHistory.test.jsx`) — 10 cases

The API layer (`api/ai.js`) is mocked; no server or database is needed.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | loading state | Before the request resolves | "Loading history…" shown |
| 2 | error state | Rejected request | "Couldn't load AI analysis history: …" with the preserved message |
| 3 | empty state | Zero saved runs | "No AI analysis yet…" shown |
| 4 | per-stock tabs | A single-mode entry covering 2 stocks | Text is split by stock name; only the active tab's write-up is visible; clicking the other tab swaps it |
| 5 | **comparison detection (regression)** | An entry whose `analysisText` is a JSON string (`{stocks, criteria}`) | Renders via `AiComparisonTable`, not the tabbed free-text view |
| 6 | rename | Click title → edit → Save | `updateAiHistoryEntry(id, {title})` called; new title shown, no full reload |
| 7 | rename validation | Save with a blank/whitespace title | Client-side "Title can't be empty." shown; API never called |
| 8 | edit write-up | Click Edit → change textarea → Save changes | `updateAiHistoryEntry(id, {analysisText})` called; new text shown |
| 9 | delete confirmed | Delete button, `window.confirm` mocked `true` | `deleteAiHistoryEntry(id)` called; entry removed from the list |
| 10 | delete cancelled | `window.confirm` mocked `false` | API never called; entry stays in the list |

### Screener — "Analyze with AI" (`ScreenerAiAnalysis.test.jsx`) — 6 cases

Isolates Person 1's AI-analysis logic embedded in `Screener.jsx` (owned by Person 3) by mocking `useScreener`/`useAuth` and the `analyzeStocks` API call, so only the shortlist/analyze/render behavior is exercised.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | disabled by default | No rows shortlisted | "Analyze with AI" button disabled |
| 2 | shortlist a row | Ticking one row's checkbox | Button enabled, labeled "Analyze with AI (1)" |
| 3 | **10-stock cap (regression)** | Ticking 11 rows | Shortlist stays capped at 10; button reads "(10)" |
| 4 | single-stock result | Analyzing exactly one stock | Free-text write-up rendered; `analyzeStocks` called with the one selected row |
| 5 | comparison result | Analyzing two stocks | `AiComparisonTable` rendered (criterion name + summary visible) |
| 6 | error state | `analyzeStocks` rejects | "Couldn't get AI analysis: …" shown with the preserved message |

### API clients (`aiApiClient.test.js`) — 6 cases

Verifies `client/src/api/ai.js` and `client/src/api/aiPreferences.js` hit the exact method/path documented in `api-documentation.md`. `global.fetch` is stubbed.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | `analyzeStocks` | Request shape | `POST /api/ai/analyze` with body `{stocks}` |
| 2 | `getAiHistory` | Request shape | `GET /api/ai/history` |
| 3 | `updateAiHistoryEntry` | Request shape | `PATCH /api/ai/history/:id` with only the changed fields |
| 4 | `deleteAiHistoryEntry` | Request shape | `DELETE /api/ai/history/:id` |
| 5 | `getAiPreferences` | Request shape | `GET /api/ai/preferences` |
| 6 | `updateAiPreferences` | Request shape | `PATCH /api/ai/preferences` with only the changed fields |

---

## Notes

- **No real AI provider, database, or network call is used anywhere in this suite.** Backend tests mock `server/src/config/db.js`'s `pool` and the global `fetch`; frontend tests mock the `api/ai.js` / `api/aiPreferences.js` client modules (or `fetch` directly for the client tests). This keeps the suite fast and deterministic, and safe to run without an `.env` or a live MySQL instance.
- **`ai.controller.test.js`'s `aiHistory.service.js` mock is a *partial* mock** (`vi.mock(..., async (importOriginal) => ({ ...await importOriginal(), saveAiAnalysis: vi.fn(), ... }))`) so the controller's real `instanceof AiAnalysisNotFoundError` check keeps working against the actual error class, while every exported function is still stubbable per test.
- **Async assertions in `AiHistory.test.jsx` use `waitFor`** around the mocked API-call expectation before querying the resulting UI text, rather than asserting immediately after `fireEvent.click`. The component's save/delete handlers are `async` functions that resolve after the click handler returns, so an immediate `expect` can race the state update; `waitFor`/`findBy*` poll until the DOM settles.
- Interactions use `fireEvent` (not `@testing-library/user-event`, which isn't a project dependency) to match the existing convention in `client/tests/enrico_javier_wijaya_250504Z/`.
