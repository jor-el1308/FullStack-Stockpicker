# Use Cases — AI Stock Analysis & Google OAuth

**Owner:** Yong Wee (Person 1) · **Features:** "Analyze with AI" on the Screener (`server/src/{routes,controllers,services}/ai.*`), AI Analysis History (`client/src/pages/AiHistory.jsx`), AI Preferences (Settings → "AI preferences" tab), "Sign in with Google" (`server/src/{routes,controllers}/auth.*`, `server/src/services/googleOAuth.service.js`, `client/src/pages/Login.jsx`)

Two sets of use cases. UC-01 through UC-07 cover the AI qualitative-analysis feature: after a user shortlists stocks from the screener results, the app sends them to an LLM for a qualitative take (recent context, growth outlook, reasoning), lets the user revisit/edit/delete past runs, and lets them tune how the model analyzes (model tier, persona, detail level, custom instructions). UC-08 through UC-10 cover "Sign in with Google": logging in or signing up with a Google account instead of email/password.

## Actors

Every `/api/ai/*` route requires authentication (`requireAuth`) **and** an active subscription (`requireActiveAccount`) — same paywall gate as the screener itself, since AI analysis is a post-screen feature.

| Actor | State | Access |
|---|---|---|
| **Visitor** | Not logged in | Blocked — API `401`, redirected to `/login` |
| **Inactive user** | Logged in, unpaid (`is_active = 0`) | Blocked — API `402 ACCOUNT_INACTIVE`, redirected to `/activate` |
| **Subscriber** | Logged in, active | Full access — primary actor below |
| **Admin** | Logged in, active, admin | Same access as Subscriber (no elevated AI privileges) |

The Google OAuth routes (`/api/auth/oauth/google*`, UC-08–UC-10) are the odd one out: they're deliberately reachable by a **Visitor** with no auth at all — they're an entry point *into* being logged in, same as `POST /auth/login`/`POST /auth/signup`, not a feature gated behind login.

---

## UC-01 — Analyze a single shortlisted stock

- **Actor:** Subscriber
- **Trigger:** On the Screener page, the user ticks exactly **one** row in the results table and clicks **"Analyze with AI"**.
- **Preconditions:** The screener has returned at least one result row.
- **Main flow:**
  1. The client calls `POST /api/ai/analyze` with the ticked row (`exchangeCode`, `stockCode`, `stockName`, `values`) and shows "Asking the AI model about 1 stock…" while waiting.
  2. The server loads the user's saved AI preferences (model tier, persona, detail level, custom instructions), builds a free-text prompt, and calls the configured model.
  3. The model's response is stripped of any stray markdown (the client renders it as plain pre-wrapped text) and returned as `{ analysis: "<text>", mode: "single" }`.
  4. The server best-effort saves the run to the user's history (title auto-generated from the stock code) before responding.
  5. The Screener shows the write-up in an "AI Analysis" panel below the results table.
- **Postcondition:** A qualitative write-up is visible, and (best-effort) a new entry appears in AI Analysis History.
- **Alternate / edge flows:**
  - *E1 — No rows selected:* the "Analyze with AI" button is disabled.
  - *E2 — AI provider error (missing/invalid API key, HTTP failure, empty response):* `500`, inline "Couldn't get AI analysis: …" message; nothing is saved to history.
  - *E3 — History save fails but the model call succeeded:* the analysis is still shown to the user (the save is best-effort and logged server-side, not surfaced as an error) — see `ai.controller.js`.
  - *E4 — Not authenticated / inactive:* handled before the page renders (see Actors).

## UC-02 — Compare 2–10 shortlisted stocks

- **Actor:** Subscriber
- **Trigger:** The user ticks **two to ten** rows in the results table and clicks **"Analyze with AI (N)"**.
- **Preconditions:** The screener has returned at least two result rows. A 10-stock cap is enforced client-side (ticking an 11th row is a no-op) and re-validated server-side.
- **Main flow:**
  1. Same request as UC-01, but with 2–10 stocks.
  2. The server builds a head-to-head comparison prompt instructing the model to pick a winner per criterion and return strict JSON, then parses/validates the JSON response (`{ stocks[], criteria[], summary, disclaimer }`).
  3. Response comes back as `{ analysis: {...}, mode: "comparison" }` and best-effort saves to history (as JSON text in the same `analysis_text` column single-stock write-ups use).
  4. The Screener renders `AiComparisonTable`: one row per criterion, one column per stock, the winning cell highlighted, plus a summary paragraph and a "not financial advice" disclaimer.
- **Postcondition:** A comparison table is visible; a new history entry is saved (best-effort).
- **Alternate / edge flows:**
  - *E1 — More than 10 rows ticked:* the 11th+ tick is silently ignored (shortlist stays at 10) — `client/src/pages/Screener.jsx` `MAX_AI_SELECTION`.
  - *E2 — Model returns malformed/non-JSON text:* the server throws and the request fails with `500` ("AI comparison response was not valid JSON" / "...was missing the expected stocks/criteria fields"), surfaced as the inline error.
  - *E3 — Re-running with a different selection:* the previous analysis panel is cleared whenever the underlying screener results change.

## UC-03 — View AI analysis history

- **Actor:** Subscriber
- **Trigger:** User opens the AI Analysis History page.
- **Preconditions:** None — an empty list is a valid state.
- **Main flow:**
  1. The page requests `GET /api/ai/history`.
  2. Entries render latest-first as cards: title, stock count, run date/time, and the analysis itself — a comparison table for comparison-mode runs (detected by attempting to `JSON.parse` the stored text and checking for `stocks[]`/`criteria[]`), or per-stock tabs for single-mode runs (segments split by locating each stock's name in the text).
- **Postcondition:** The user's full analysis history is visible.
- **Alternate / edge flows:**
  - *E1 — No history yet:* "No AI analysis yet. Shortlist stocks on the Screener and click 'Analyze with AI' to get started."
  - *E2 — Request fails:* inline "Couldn't load AI analysis history: …" message.
  - *E3 — Stock name not found in the stored text (model paraphrased it, or a user hand-edited the text):* falls back to one "whole thing" tab instead of hiding the analysis.

## UC-04 — Rename a saved analysis run

- **Actor:** Subscriber
- **Trigger:** User clicks a history entry's title, edits it, and confirms.
- **Preconditions:** The entry belongs to the logged-in user.
- **Main flow:** Client calls `PATCH /api/ai/history/:id` with `{ title }`; on success the card's title updates in place.
- **Postcondition:** The run's title is updated.
- **Alternate / edge flows:**
  - *E1 — Empty title submitted:* rejected client-side ("Title can't be empty.") before any request is sent; the server also rejects an empty/whitespace-only title with `400`.
  - *E2 — Title over 200 characters:* input is capped at 200 characters (`maxLength`); server also enforces the limit.
  - *E3 — Entry doesn't exist or belongs to another user:* `404`, shown inline.

## UC-05 — Edit a saved analysis write-up

- **Actor:** Subscriber
- **Trigger:** User clicks "Edit" on a history entry, changes the text, and saves.
- **Preconditions:** The entry belongs to the logged-in user.
- **Main flow:** Client calls `PATCH /api/ai/history/:id` with `{ analysisText }`. The edit is a plain user annotation/correction — it is **not** a re-run of the model. On success the stored text (and any per-stock tabs derived from it) refreshes.
- **Postcondition:** The run's analysis text is permanently overwritten with the user's edit.
- **Alternate / edge flows:**
  - *E1 — Empty text submitted:* rejected client-side and server-side (`400`, "Analysis text can't be empty").
  - *E2 — Editing a comparison-mode entry as free text:* allowed — the server stores whatever text is sent; if the edited text is no longer valid JSON, the entry falls back to rendering as single-mode tabbed text on next load.

## UC-06 — Delete a saved analysis run

- **Actor:** Subscriber
- **Trigger:** User clicks the delete (trash) icon on a history entry and confirms the browser confirmation dialog.
- **Preconditions:** The entry belongs to the logged-in user.
- **Main flow:** Client calls `DELETE /api/ai/history/:id`; on success the entry is removed from the list immediately (no full reload).
- **Postcondition:** The run is permanently removed.
- **Alternate / edge flows:**
  - *E1 — User cancels the confirmation dialog:* no request is sent.
  - *E2 — Entry doesn't exist or belongs to another user:* `404`, shown inline; the card stays in the list.

## UC-07 — Configure AI preferences

- **Actor:** Subscriber
- **Trigger:** User opens Settings → "AI preferences" tab.
- **Preconditions:** None — a user who has never saved preferences sees the defaults (`flash` / `balanced` / `concise` / no custom instructions).
- **Main flow:**
  1. The tab requests `GET /api/ai/preferences` and pre-selects the saved (or default) model tier, persona, detail level, and fills the custom-instructions textarea.
  2. The user picks a different model tier (Gemini Flash / GPT-4o mini / Claude Haiku / DeepSeek Chat), analyst persona (balanced / conservative / growth / income), detail level (concise / detailed), and/or edits the custom-instructions text (capped at 1000 characters client- and server-side).
  3. "Save changes" is disabled until the draft differs from the last-saved values; clicking it sends `PATCH /api/ai/preferences` with only the changed-shape payload and shows "Saved." on success.
  4. The next `POST /api/ai/analyze` call (UC-01/UC-02) uses these saved preferences to steer the prompt.
- **Postcondition:** The user's preferences row is upserted (`ai_preferences`, one row per user) and used by all subsequent analyses.
- **Alternate / edge flows:**
  - *E1 — No changes made:* "Save changes" stays disabled.
  - *E2 — Save request fails:* inline error message; the draft is preserved so the user doesn't lose their edits.
  - *E3 — Custom instructions at the 1000-character cap:* further typing is truncated client-side; a `1000/1000` counter is shown.

---

## UC-08 — Sign up / log in with a Google account (first time)

- **Actor:** Visitor (not logged in, and this is the first time they've ever used this Google account with the app — neither `google_id` nor their Google email exists in `users`).
- **Trigger:** User clicks the white "Continue with Google" button under the login/signup form on `/login`.
- **Preconditions:** None — this button is the same for both the "login" and "signup" modes of the form, since a first-time Google sign-in *is* the signup.
- **Main flow:**
  1. The browser navigates (full page load, not a fetch) to `GET /api/auth/oauth/google`, which stashes a CSRF `state` value in a short-lived cookie and redirects to Google's consent screen.
  2. The user picks a Google account and grants access (`select_account` is forced, so a shared machine doesn't silently reuse whichever Google session is already active).
  3. Google redirects back to `GET /api/auth/oauth/google/callback` with an authorization `code`.
  4. The server verifies the CSRF `state`, exchanges the code for the user's verified Google profile, finds no matching `google_id` or email, and creates a brand-new account (`password_hash = NULL` — see migration 014) with `is_active = 0` like any other new signup.
  5. A normal session cookie is issued (no email-OTP step — see UC-09's note) and the browser is redirected to `/login?oauth=success`.
  6. The client fetches `GET /api/auth/me`, logs the user in, and — since the new account isn't active yet — routes to `/activate`, same as a fresh password signup.
- **Postcondition:** A new `users` row exists, linked to the Google account; the user is logged in and on the paywall page.
- **Alternate / edge flows:**
  - *E1 — User cancels/denies consent on Google's screen:* redirected to `/login?oauth=error&message=Google+sign-in+was+cancelled`, shown inline; no account is created.
  - *E2 — Google account has no verified email:* rejected before any account is touched; generic "Google sign-in failed" message (doesn't reveal *why*, to avoid leaking account-enumeration-adjacent detail).

## UC-09 — Log in with a Google account (returning user)

- **Actor:** Visitor whose Google account is already linked (`google_id` matches an existing row).
- **Trigger:** Same "Continue with Google" button.
- **Main flow:** Same steps as UC-08, except step 4 finds the existing account by `google_id` immediately and step 6 routes to `/` (screener) instead of `/activate` if the account is already active, or `/activate` if it isn't (e.g. a lapsed subscription) — identical branching to a normal password login's `finishLogin()`.
- **Postcondition:** The existing user is logged in.
- **Note (design decision, flagged for review):** Google sign-in does **not** go through the app's email-OTP second factor (`verifyLoginOtp` — see the AI feature's sibling auth flow / `auth.controller.js`'s `login()`). Google has already authenticated the user (and enforces its own 2FA if the user has that turned on for their Google account), so a second emailed code would be redundant friction rather than added security.

## UC-10 — Google sign-in on an email that already has a password account

- **Actor:** Visitor with an existing password-based account under the same email as the Google account they sign in with.
- **Trigger:** Same "Continue with Google" button, using a Google account whose (verified) email matches an existing `users.email`, but whose `google_id` has never been seen before.
- **Main flow:**
  1. Steps 1–3 as UC-08.
  2. The server finds no `google_id` match, but finds an existing account by email. Because Google has already verified the caller controls that email address, the accounts are treated as the same person: `google_id` is written onto the existing row rather than creating a duplicate account.
  3. From then on, that account can be logged into with **either** the original password (`POST /auth/login`, still going through email-OTP) **or** this Google account (skipping OTP, per UC-09's note) — both reach the same `users` row.
- **Postcondition:** One account, now reachable two ways; no duplicate account is created.
- **Alternate / edge flows:**
  - *E1 — The email match happens between two different people (unlikely, since Google verifies the address):* out of scope — this app trusts Google's `email_verified` claim the same way `email-change/verify` trusts its own OTP as proof of address ownership.

---

## Edge-case coverage summary

| Condition | Handled in | Result |
|---|---|---|
| 0 stocks selected | Screener "Analyze with AI" button | Button disabled |
| >10 stocks ticked | Screener shortlist (`MAX_AI_SELECTION`) | 11th+ tick ignored, cap stays at 10 |
| `stocks` array empty / >10 in request body | `ai.controller.js` zod schema | `400` |
| AI provider API key missing | `ai.service.js` | `500`, inline error naming the missing key |
| AI provider HTTP error / empty response | `ai.service.js` | `500` |
| Comparison response not valid/expected JSON | `ai.service.js` `parseComparisonResponse` | `500` |
| History save fails after a successful analysis | `ai.controller.js` (best-effort try/catch) | Analysis still returned to the user; failure only logged |
| Rename/edit with empty value | Client validation + server zod `min(1)` | Rejected before/at the API, `400` if it reaches the server |
| Update with neither `title` nor `analysisText` | `ai.controller.js` zod `.refine` | `400` |
| Update/delete of a non-existent or another user's entry | `aiHistory.service.js` `AiAnalysisNotFoundError` | `404` |
| Preferences PATCH with no recognized fields | `aiPreferences.controller.js` zod `.refine` | `400` |
| Custom instructions over 1000 characters | Client `slice()` cap + server zod `max(1000)` | Truncated client-side; `400` if bypassed |
| Unauthenticated | `requireAuth` + API `401` | Redirect to `/login` |
| Inactive / unpaid account | `requireActiveAccount` + API `402` | Redirect to `/activate` |
| User denies/cancels Google consent | `googleOAuthCallback` (`error` query param) | Redirect to `/login?oauth=error&message=...`; no account touched |
| Forged/replayed/expired OAuth callback (`state` missing or mismatched) | `googleOAuthCallback` CSRF check | Redirect to `/login?oauth=error&message=...`; code exchange never attempted |
| Google account has no verified email | `googleOAuth.service.js` `exchangeCodeForProfile` | Redirect to `/login?oauth=error&message=...`; no account touched |
| Google email matches an existing password account | `auth.service.js` `findOrCreateGoogleUser` | `google_id` linked onto the existing row, not duplicated (see UC-10) |
| `GET /auth/me` fails right after a successful OAuth redirect | `Login.jsx`'s `oauth=success` effect | Inline "Google sign-in failed" message; user not marked logged in client-side |
