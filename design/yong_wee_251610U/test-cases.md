# Test Cases — AI Stock Analysis & Google/Microsoft OAuth

**Owner:** Yong Wee (Person 1) · **Framework:** Vitest (backend: Node environment + mocked MySQL pool/fetch; frontend: Vitest + React Testing Library / jsdom)

Backend and frontend unit tests for three features:

- **AI qualitative analysis:** `ai.service.js` (prompt building + Gemini/OpenRouter calls for both the initial analysis and follow-up chat replies), `aiHistory.service.js` / `aiPreferences.service.js` (persistence), `ai.controller.js` / `aiPreferences.controller.js` (validation + HTTP mapping), `aiChatStorage.js` (the `localStorage`-backed follow-up chat session store), and the React side (`AiComparisonTable`, `AiHistory` including its client-side-only `ChatSessionEntry` cards, the "Analyze with AI" flow on `Screener`, `AiChatBox` - the follow-up chat widget, and the `api/ai.js` / `api/aiPreferences.js` clients).
- **"Sign in with Google":** `googleOAuth.service.js` (Google URL building, state generation, code-for-profile exchange), `auth.service.js`'s `findOrCreateGoogleUser`/`findUserByGoogleId` (account matching/linking/creation), `auth.controller.js`'s `googleOAuthStart`/`googleOAuthCallback` (the CSRF state cookie round trip, error redirects, session cookie issuance), and the React side (the Google button + the `?oauth=success|error` redirect handling on `Login.jsx`).
- **"Sign in with Microsoft":** a file-for-file mirror of the Google suite above — `microsoftOAuth.service.js` (Microsoft identity platform URL building against the configured tenant, state generation, code-for-profile exchange via Microsoft Graph), `auth.service.js`'s `findOrCreateMicrosoftUser`/`findUserByMicrosoftId`, `auth.controller.js`'s `microsoftOAuthStart`/`microsoftOAuthCallback`, and the Microsoft button + shared `?oauth=success|error` handling on `Login.jsx`.

**All 153 tests pass** (95 backend + 58 frontend), of which 10 backend + 21 frontend are new for the AI follow-up chat extension (`POST /api/ai/chat`, `AiChatBox.jsx`, `aiChatStorage.js`) — on top of the 21 backend + 3 frontend that were new for Microsoft OAuth, and the 20 backend + 6 frontend that were new for Google OAuth before that. `ScreenerAiAnalysis.test.jsx` is also updated in this pass (not new coverage, a fix) — 5 of its 6 cases had been broken by an unrelated, earlier Screener "Analyze with AI" button redesign (a floating action button, found by `aria-label`, replaced the old labelled button the tests queried by visible text) that predates the chat extension; see its section below for what changed. (These counts are scoped to this owner's test files, `server/tests/yong_wee_251610U/` and `client/tests/yong_wee_251610U/` — running `npm test` in `client/` also runs other owners' tests alongside these.)

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

Or from the repo root: `npm test --workspace=server` / `npm test --workspace=client`. Test files live in `server/tests/yong_wee_251610U/` and `client/tests/yong_wee_251610U/`. No real database, network call, AI API key, or Google/Microsoft OAuth credentials are needed for any of these — the MySQL pool, `fetch`, and the API-client/service modules are all mocked (see Notes).

---

## Backend tests

### `ai.service.js` (`ai.service.test.js`) — 16 cases

The core "send shortlisted stocks to an LLM" logic, covering both `getQualitativeAnalysis` (cases 1-11) and the follow-up chat prompt builder `getFollowUpAnswer` (cases 12-16, new for the chat extension). `global.fetch` is stubbed so no real provider is called.

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
| 12 | follow-up reply, markdown stripped | `getFollowUpAnswer` happy path | Returns the model's text with markdown tokens stripped, same as the single-stock write-up |
| 13 | prompt includes original analysis, persona, and prior turns | Persona/custom instructions + a two-turn `history` passed in | Prompt sent to the model contains the persona description, the `originalAnalysis` text, every prior turn, and the new `question` |
| 14 | missing Gemini key | `AI_RECOMMENDATION_API_KEY` unset for the default tier | Rejects with `/AI_RECOMMENDATION_API_KEY is not set/`; `fetch` never called |
| 15 | empty model response | Provider returns no candidates/text | Rejects with `/empty response/` |
| 16 | OpenRouter routing | A non-`flash` tier routes through OpenRouter with a bearer token | URL contains `openrouter.ai`; `Authorization: Bearer test-openrouter-key` |

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

### `ai.controller.js` (`ai.controller.test.js`) — 18 cases

Request validation, the single-vs-comparison response shape, best-effort history persistence, the follow-up chat endpoint (cases 7-11, new for the chat extension), and 400/404/500 error mapping. The service layer is mocked.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | empty `stocks` array | `POST /analyze` validation | `400`; AI service never called |
| 2 | >10 stocks | `POST /analyze` validation | `400`; AI service never called |
| 3 | single-stock success | Happy path | `200` with `{analysis, mode:"single", preferences}` (the AI preferences this run used, echoed for the follow-up chat's context - see UC-08); history saved with the raw text |
| 4 | comparison success | Happy path | `200` with `analysis` as an **object** plus `preferences`; history saved as its **JSON string** |
| 5 | best-effort persistence | History save fails after a successful model call | Still returns `200` with the analysis (failure only logged) |
| 6 | AI provider failure | `getQualitativeAnalysis` rejects | `500` with a message naming the required API key |
| 7 | chat: missing original analysis | `POST /chat` validation | `400`; `getFollowUpAnswer` never called |
| 8 | chat: empty question | `POST /chat` validation | `400`; `getFollowUpAnswer` never called |
| 9 | chat: invalid `mode` | `mode` outside `single`/`comparison` | `400`; `getFollowUpAnswer` never called |
| 10 | chat: happy path | Valid full-context request | `200` with `{reply}`; `getFollowUpAnswer` called with the forwarded stocks/mode/originalAnalysis/question |
| 11 | chat: AI provider failure | `getFollowUpAnswer` rejects | `500` with a message naming the required API key |
| 12 | get history success | `GET /history` happy path | `200` with `{history}` |
| 13 | get history failure | Service throws | `500` |
| 14 | update with neither field | `PATCH /history/:id` validation | `400`; service never called |
| 15 | update not found | Service throws `AiAnalysisNotFoundError` | `404` |
| 16 | update success | Happy path | `200` with the updated entry; service called with `(userId, id, patch)` |
| 17 | delete success | Happy path | `200` with `{id}` |
| 18 | delete not found | Service throws `AiAnalysisNotFoundError` | `404` |

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

### `googleOAuth.service.js` (`googleOAuth.service.test.js`) — 8 cases

Building the Google consent URL, generating the CSRF `state` value, and exchanging an authorization code for a verified profile. `global.fetch` is stubbed.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | state uniqueness | `generateOAuthState` called twice | Two different, URL-safe, non-trivially-short values |
| 2 | auth URL shape | `buildGoogleAuthUrl` with a given state | Points at `accounts.google.com/o/oauth2/v2/auth` with correct `client_id`/`redirect_uri`/`response_type`/`scope`/`state` |
| 3 | missing client id | `GOOGLE_CLIENT_ID` unset | Throws `/GOOGLE_CLIENT_ID is not set/` |
| 4 | code exchange happy path | Valid code | Token endpoint called with `code`/`client_secret`/`grant_type`; userinfo endpoint called with `Authorization: Bearer <access_token>`; returns `{googleId, email, name, avatar}` |
| 5 | email normalization / fallbacks | Profile has no `name`/`picture` | Email lower-cased; `name` falls back to the email; `avatar` is `null` |
| 6 | token exchange HTTP failure | Non-2xx from the token endpoint | Rejects with `/token exchange failed \(400\)/` |
| 7 | userinfo HTTP failure | Non-2xx from the userinfo endpoint | Rejects with `/profile fetch failed \(401\)/` |
| 8 | unverified email | `email_verified: false` | Rejects with `/no verified email/` |

### `auth.service.js` — Google persistence (`googleOAuthUser.service.test.js`) — 4 cases

`findUserByGoogleId` and `findOrCreateGoogleUser` — account matching/linking/creation. `pool` is mocked.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | lookup by google_id, no match | `findUserByGoogleId` with an unknown id | Returns `null`; SQL filters on `google_id = ?` |
| 2 | repeat sign-in | `google_id` already linked to a user | Returns that user immediately; only one query runs (no email lookup, no write) |
| 3 | link onto existing password account | No `google_id` match, but the email matches an existing account | `UPDATE users SET google_id = ?` runs on that row's id; returns the refreshed user |
| 4 | brand-new account | Neither `google_id` nor email matches | `INSERT INTO users` runs with `google_id` set and no password; returns the newly created user |

### `auth.controller.js` — Google OAuth (`googleOAuth.controller.test.js`) — 8 cases

`googleOAuthStart`/`googleOAuthCallback` — the CSRF state cookie round trip, every error-redirect branch, and the happy path. `googleOAuth.service.js` and the Google half of `auth.service.js` are mocked.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | start: happy path | `googleOAuthStart` | Sets `g_oauth_state` httpOnly cookie; redirects to the built Google URL |
| 2 | start: misconfiguration | `generateOAuthState` throws (e.g. missing client id) | Redirects to `/login?oauth=error` instead of crashing |
| 3 | callback: consent denied | `?error=access_denied` | Redirects with `oauth=error&message=Google+sign-in+was+cancelled`; `exchangeCodeForProfile` never called |
| 4 | callback: state mismatch (CSRF) | `state` query param ≠ `g_oauth_state` cookie | Redirects with a "session expired" message; `exchangeCodeForProfile` never called |
| 5 | callback: missing code | No `code` in the query string | Same "session expired" redirect |
| 6 | callback: state cookie always cleared | Any callback outcome | `res.clearCookie("g_oauth_state")` called regardless of success/failure |
| 7 | callback: happy path | Valid code + matching state | `exchangeCodeForProfile`/`findOrCreateGoogleUser`/`issueToken` called in order; `token` session cookie set; redirects with `oauth=success` |
| 8 | callback: code exchange fails | `exchangeCodeForProfile` rejects | Redirects with `oauth=error`; `findOrCreateGoogleUser` never called (no account touched) |

### `microsoftOAuth.service.js` (`microsoftOAuth.service.test.js`) — 9 cases

Building the Microsoft consent URL (against the configured tenant), generating the CSRF `state` value, and exchanging an authorization code for a verified profile via Microsoft Graph. `global.fetch` is stubbed. One case more than the Google equivalent because tenant selection is an extra axis Google's flow doesn't have.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | state uniqueness | `generateOAuthState` called twice | Two different, URL-safe, non-trivially-short values |
| 2 | auth URL shape (default tenant) | `buildMicrosoftAuthUrl` with a given state, `MS_TENANT_ID=common` | Points at `login.microsoftonline.com/common/oauth2/v2.0/authorize` with correct `client_id`/`redirect_uri`/`response_type`/`scope`/`state` |
| 3 | auth URL shape (specific tenant) | `MS_TENANT_ID` set to an org's tenant id | URL path uses that tenant id instead of `common` |
| 4 | missing client id | `MS_CLIENT_ID` unset | Throws `/MS_CLIENT_ID is not set/` |
| 5 | code exchange happy path | Valid code | Token endpoint (`login.microsoftonline.com/common/oauth2/v2.0/token`) called with `code`/`client_secret`/`grant_type`; Graph `/me` called with `Authorization: Bearer <access_token>`; returns `{microsoftId, email, name, avatar: null}` |
| 6 | email/name fallbacks | Profile has no `mail`, only `userPrincipalName`; no `displayName` | Email lower-cased from `userPrincipalName`; `name` falls back to the pre-lowercase email (same pattern as Google's `name` fallback) |
| 7 | token exchange HTTP failure | Non-2xx from the token endpoint | Rejects with `/token exchange failed \(400\)/` |
| 8 | Graph profile fetch HTTP failure | Non-2xx from Graph `/me` | Rejects with `/profile fetch failed \(401\)/` |
| 9 | no usable email | Both `mail` and `userPrincipalName` absent | Rejects with `/no usable email/` |

### `auth.service.js` — Microsoft persistence (`microsoftOAuthUser.service.test.js`) — 4 cases

`findUserByMicrosoftId` and `findOrCreateMicrosoftUser` — account matching/linking/creation, mirroring the Google persistence tests exactly. `pool` is mocked.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | lookup by microsoft_id, no match | `findUserByMicrosoftId` with an unknown id | Returns `null`; SQL filters on `microsoft_id = ?` |
| 2 | repeat sign-in | `microsoft_id` already linked to a user | Returns that user immediately; only one query runs (no email lookup, no write) |
| 3 | link onto existing account | No `microsoft_id` match, but the email matches an existing account | `UPDATE users SET microsoft_id = ?` runs on that row's id; returns the refreshed user |
| 4 | brand-new account | Neither `microsoft_id` nor email matches | `INSERT INTO users` runs with `microsoft_id` set and no password; returns the newly created user |

### `auth.controller.js` — Microsoft OAuth (`microsoftOAuth.controller.test.js`) — 8 cases

`microsoftOAuthStart`/`microsoftOAuthCallback` — the CSRF state cookie round trip, every error-redirect branch, and the happy path, mirroring the Google controller tests exactly (including the separate `ms_oauth_state` cookie name, so a flow started against one provider can't complete against the other's callback). `microsoftOAuth.service.js` and the Microsoft half of `auth.service.js` are mocked.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | start: happy path | `microsoftOAuthStart` | Sets `ms_oauth_state` httpOnly cookie; redirects to the built Microsoft URL |
| 2 | start: misconfiguration | `generateOAuthState` throws (e.g. missing client id) | Redirects to `/login?oauth=error` instead of crashing |
| 3 | callback: consent denied | `?error=access_denied` | Redirects with `oauth=error&message=Microsoft+sign-in+was+cancelled`; `exchangeCodeForProfile` never called |
| 4 | callback: state mismatch (CSRF) | `state` query param ≠ `ms_oauth_state` cookie | Redirects with a "session expired" message; `exchangeCodeForProfile` never called |
| 5 | callback: missing code | No `code` in the query string | Same "session expired" redirect |
| 6 | callback: state cookie always cleared | Any callback outcome | `res.clearCookie("ms_oauth_state")` called regardless of success/failure |
| 7 | callback: happy path | Valid code + matching state | `exchangeCodeForProfile`/`findOrCreateMicrosoftUser`/`issueToken` called in order; `token` session cookie set; redirects with `oauth=success` |
| 8 | callback: code exchange fails | `exchangeCodeForProfile` rejects | Redirects with `oauth=error`; `findOrCreateMicrosoftUser` never called (no account touched) |

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

### `AiHistory` (`AiHistory.test.jsx`) — 14 cases

The API layer (`api/ai.js`) and the client-side chat session store (`aiChatStorage.js`) are both mocked; no server, database, or real `localStorage` state is needed. Cases 11-14 (new for the chat extension) cover `ChatSessionEntry` - the read-only card for a client-side-only follow-up conversation, merged chronologically alongside the DB-backed cards above.

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
| 11 | chat session merged in | `listChatSessions()` returns one session alongside a DB-backed entry | "Follow-up chat · this browser only" label, persona chip, and both message bubbles render; the DB-backed run it followed up on still shows too |
| 12 | comparison-mode chat session | A chat session whose `originalAnalysis` is a JSON comparison string | The "Original analysis" `<details>` renders via `AiComparisonTable`, same detection as case 5 |
| 13 | delete chat session confirmed | Delete button, `window.confirm` mocked `true` | `deleteChatSession(id)` called; session removed from the list |
| 14 | delete chat session cancelled | `window.confirm` mocked `false` | `deleteChatSession` never called; session stays in the list |

### Screener — "Analyze with AI" (`ScreenerAiAnalysis.test.jsx`) — 6 cases

Isolates Person 1's AI-analysis logic embedded in `Screener.jsx` (owned by Person 3) by mocking `useScreener`/`useAuth` and the `analyzeStocks`/`getAiPreferences` API calls, so only the shortlist/analyze/render behavior is exercised. **Updated in this pass** (a fix, not new coverage) to match an earlier, unrelated Screener redesign: the "Analyze with AI" trigger is now a floating action button (`.ai-fab`, bottom-right of the viewport) with no visible label - just a sparkles icon and a count badge - so these tests find it by its `aria-label` instead of visible button text. The label itself is dynamic, encoding both the shortlist count and the active AI model tier (`GET /api/ai/preferences`, now mocked here too): `"Analyze with AI, using <model> (select rows in the results table first)"` when nothing is shortlisted, or `"Analyze <N> selected stock(s) with AI, using <model>"` once rows are ticked.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | disabled by default | No rows shortlisted | Fab button disabled, `aria-label` starting "Analyze with AI, using …" |
| 2 | shortlist a row | Ticking one row's checkbox | Fab enabled, `aria-label` "Analyze 1 selected stock with AI, using …"; count badge reads "1" |
| 3 | **10-stock cap (regression)** | Ticking 11 rows | Shortlist stays capped at 10; `aria-label` "Analyze 10 selected stocks with AI, using …" |
| 4 | single-stock result | Analyzing exactly one stock | Free-text write-up rendered; `analyzeStocks` called with the one selected row |
| 5 | comparison result | Analyzing two stocks | `AiComparisonTable` rendered (criterion name + summary visible) |
| 6 | error state | `analyzeStocks` rejects | "Couldn't get AI analysis: …" shown with the preserved message |

Cases 1-3 use `findByRole` (not `getByRole`) for the fab button, awaiting the mocked `GET /api/ai/preferences` fetch the fab's label depends on so its resolution doesn't leak a state update outside of React Testing Library's `act()` wrapper after the test's assertion returns.

### `AiChatBox` (`AiChatBox.test.jsx`) — 7 cases, new for the chat extension

The follow-up chat widget shown under a completed run (`client/src/components/AiChatBox.jsx`, see UC-08). `api/ai.js`'s `chatAboutStocks` and `aiChatStorage.js`'s `loadChatSession`/`saveChatSession` are both mocked. jsdom doesn't implement `Element.prototype.scrollIntoView` (used to keep the latest bubble in view), so it's stubbed per-test - unrelated to what these tests verify.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | suggested prompts | No prior session (`loadChatSession` returns `null`) | The three suggested-prompt chips render; no message thread |
| 2 | loads an existing session | `loadChatSession` returns a session with messages | Those messages render instead of the suggested prompts |
| 3 | suggested prompt click | Clicking a chip | Sends it as the question; both the user and assistant bubbles render on success |
| 4 | typed question, sending state | Type + submit, reply promise not yet resolved | Input clears and disables; "Thinking…" bubble shown; input re-enables once the reply resolves |
| 5 | session persisted on success | A successful reply | `saveChatSession` called with the session id and the full updated `messages` array |
| 6 | **error rollback** | `chatAboutStocks` rejects | "Couldn't send that: …" shown; the optimistic user bubble is removed from the thread; the typed text is restored into the input; `saveChatSession` never called |
| 7 | empty/whitespace question | Input is blank/spaces only | Send button disabled; submitting the form does not call `chatAboutStocks` |

### `aiChatStorage` (`aiChatStorage.test.js`) — 9 cases, new for the chat extension

The `localStorage`-backed persistence for follow-up chat sessions (`client/src/lib/aiChatStorage.js`). Runs against jsdom's real `localStorage`, cleared before each test.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | missing session | `loadChatSession` with an id never saved | Returns `null` |
| 2 | no id given | `loadChatSession(undefined)` | Returns `null` without touching storage |
| 3 | round trip | `saveChatSession` then `loadChatSession` | Returns the exact session object saved |
| 4 | upsert by id | `saveChatSession` called twice with the same `id` | `listChatSessions()` still has length 1; the second save's data wins |
| 5 | latest-first ordering | Three sessions saved with different `updatedAt` | `listChatSessions()` returns them newest-`updatedAt`-first |
| 6 | delete | `deleteChatSession` on one of two saved sessions | The deleted id is gone; the other session is untouched |
| 7 | 50-session cap | 55 sessions saved in sequence | `listChatSessions()` has length 50; the earliest-saved sessions are the ones dropped |
| 8 | corrupt JSON in storage | `localStorage` holds a malformed JSON string | `listChatSessions()` falls back to `[]` instead of throwing |
| 9 | non-array JSON in storage | `localStorage` holds valid JSON that isn't an array | `listChatSessions()` falls back to `[]` |

### API clients (`aiApiClient.test.js`) — 7 cases

Verifies `client/src/api/ai.js` and `client/src/api/aiPreferences.js` hit the exact method/path documented in `api-documentation.md`. `global.fetch` is stubbed. Case 2 (new for the chat extension) covers `chatAboutStocks`.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | `analyzeStocks` | Request shape | `POST /api/ai/analyze` with body `{stocks}` |
| 2 | `chatAboutStocks` | Request shape | `POST /api/ai/chat` with body `{stocks, mode, originalAnalysis, preferences, history, question}` |
| 3 | `getAiHistory` | Request shape | `GET /api/ai/history` |
| 4 | `updateAiHistoryEntry` | Request shape | `PATCH /api/ai/history/:id` with only the changed fields |
| 5 | `deleteAiHistoryEntry` | Request shape | `DELETE /api/ai/history/:id` |
| 6 | `getAiPreferences` | Request shape | `GET /api/ai/preferences` |
| 7 | `updateAiPreferences` | Request shape | `PATCH /api/ai/preferences` with only the changed fields |

### Login — Google OAuth (`LoginGoogleOAuth.test.jsx`) — 6 cases

Covers the Google-specific pieces of `Login.jsx`: the button itself and the effect that reacts to the `?oauth=success|error` query string the server redirects back to. `api/client.js` and `AuthContext` are both mocked so no real server/session is needed; `MemoryRouter` + nested `Routes` let the test observe which page the app actually lands on after the redirect.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | Google button | Rendered on `/login` with no query string | A link named "Continue with Google" with `href="/api/auth/oauth/google"` |
| 2 | success → active account | `?oauth=success`, `GET /auth/me` resolves with `isActive: true` | `login(user)` called; app navigates to the screener (`/`) |
| 3 | success → inactive account | Same, but `isActive: false` | Navigates to `/activate` instead |
| 4 | success but `/auth/me` fails | `GET /auth/me` rejects | Generic inline "Sign-in failed…" shown (the `?oauth=success` effect is shared by both providers, so the message no longer names Google specifically); `login()` never called |
| 5 | server-side error | `?oauth=error&message=Google+sign-in+was+cancelled` | That exact message shown inline; `GET /auth/me` never called |
| 6 | already logged in | `user` already set (from `useAuth`) | Renders the account panel, not the form/button |

### Login — Microsoft OAuth (`LoginMicrosoftOAuth.test.jsx`) — 3 cases

Covers the Microsoft-specific pieces of `Login.jsx`: the button itself, and confirms it renders alongside (not instead of) the Google button. Deliberately smaller than the Google suite above — the `?oauth=success` routing-by-`isActive` logic and the "already logged in" case are provider-agnostic (same shared effect/component, already covered by `LoginGoogleOAuth.test.jsx`), so only the Microsoft-specific button and the Microsoft-flavored `?oauth=error` message are re-tested here. `api/client.js` and `AuthContext` are both mocked, same setup as the Google test file.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | Microsoft button | Rendered on `/login` with no query string | A link named "Continue with Microsoft" with `href="/api/auth/oauth/microsoft"`, alongside the Google link |
| 2 | success → active account | `?oauth=success`, `GET /auth/me` resolves with `isActive: true` | `login(user)` called; app navigates to the screener (`/`) — same shared effect as Google's |
| 3 | server-side error | `?oauth=error&message=Microsoft+sign-in+was+cancelled` | That exact message shown inline; `GET /auth/me` never called |

---

## Notes

- **No real AI provider, database, network call, or Google/Microsoft OAuth credentials are used anywhere in this suite.** Backend tests mock `server/src/config/db.js`'s `pool` and the global `fetch`; frontend tests mock the `api/ai.js` / `api/aiPreferences.js` / `api/client.js` and `AuthContext` modules (or `fetch` directly for the client tests). This keeps the suite fast and deterministic, and safe to run without an `.env` or a live MySQL instance.
- **`ai.controller.test.js`'s `aiHistory.service.js` mock is a *partial* mock** (`vi.mock(..., async (importOriginal) => ({ ...await importOriginal(), saveAiAnalysis: vi.fn(), ... }))`) so the controller's real `instanceof AiAnalysisNotFoundError` check keeps working against the actual error class, while every exported function is still stubbable per test.
- **Async assertions in `AiHistory.test.jsx` use `waitFor`** around the mocked API-call expectation before querying the resulting UI text, rather than asserting immediately after `fireEvent.click`. The component's save/delete handlers are `async` functions that resolve after the click handler returns, so an immediate `expect` can race the state update; `waitFor`/`findBy*` poll until the DOM settles.
- **`LoginGoogleOAuth.test.jsx` renders `Login` inside a `MemoryRouter` with sibling `/`/`/activate` routes** (rather than just `Login` alone) specifically so the post-redirect `navigate()` calls are observable as "which page rendered", not just "was `navigate` called with the right string" - closer to what a user actually sees. `LoginMicrosoftOAuth.test.jsx` reuses the same `renderLogin` helper shape.
- **The Microsoft OAuth test files (`microsoftOAuth.service.test.js`, `microsoftOAuthUser.service.test.js`, `microsoftOAuth.controller.test.js`, `LoginMicrosoftOAuth.test.jsx`) deliberately mirror their Google counterparts case-for-case** (with a couple of Microsoft-only additions - tenant selection in the auth-URL test, the `mail`/`userPrincipalName` fallback) rather than being written independently, since the implementation itself is a case-for-case mirror of the Google flow (`microsoftOAuth.service.js`/`microsoftOAuthStart`/`microsoftOAuthCallback`/`findOrCreateMicrosoftUser` next to their Google equivalents). The frontend suite is the one exception - see its note above for why it's smaller.
- Interactions use `fireEvent` (not `@testing-library/user-event`, which isn't a project dependency) to match the existing convention in `client/tests/enrico_javier_wijaya_250504Z/`.
- **`aiChatStorage.test.js` runs against jsdom's real `localStorage`** (cleared in `beforeEach`) rather than mocking it, since the module *is* the localStorage wrapper being tested - there's nothing left to verify if the storage layer itself is stubbed out. Every other test file that touches `aiChatStorage.js` indirectly (`AiChatBox.test.jsx`, `AiHistory.test.jsx`) mocks the module instead, so those stay focused on their own component's behavior.
- **`AiChatBox.test.jsx` stubs `Element.prototype.scrollIntoView`** (`vi.fn()` in `beforeEach`) since jsdom doesn't implement it and the component calls it on every message-list update purely to keep the latest bubble in view - unrelated to what the tests verify, but left unstubbed it throws and fails every test that sends a message.
- **`analyzeStocks`'s response now includes an echoed `preferences` field** (added alongside the chat extension - see UC-08/api-documentation.md), which is why the 3 pre-existing `ai.controller.test.js` cases asserting the full response shape needed updating in this pass, not just the new chat cases.
- **`ScreenerAiAnalysis.test.jsx` now mocks `api/aiPreferences.js`** alongside `api/ai.js`, since the fab button's `aria-label`/tooltip reads the caller's saved AI preferences (`GET /api/ai/preferences`) on mount - unmocked, the real module would attempt a real `fetch` in jsdom instead of resolving deterministically.
