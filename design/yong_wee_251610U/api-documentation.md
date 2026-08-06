# API Documentation — AI Stock Analysis & Google/Microsoft OAuth

**Owner:** Yong Wee (Person 1)

Three features: (1) the AI qualitative-analysis feature — running an analysis on shortlisted stocks, managing saved analysis history, and reading/updating a user's AI preferences (`server/src/routes/ai.routes.js`, `server/src/controllers/{ai,aiPreferences}.controller.js`, `server/src/services/{ai,aiHistory,aiPreferences}.service.js`); (2) "Sign in with Google" — an alternate, password-less way to log in or sign up (`server/src/routes/auth.routes.js`'s `/oauth/google*` routes, `server/src/controllers/auth.controller.js`'s `googleOAuthStart`/`googleOAuthCallback`, `server/src/services/googleOAuth.service.js`, `server/src/services/auth.service.js`'s `findOrCreateGoogleUser`); and (3) "Sign in with Microsoft" — the same idea against a Microsoft/Azure AD account instead (`server/src/routes/auth.routes.js`'s `/oauth/microsoft*` routes, `server/src/controllers/auth.controller.js`'s `microsoftOAuthStart`/`microsoftOAuthCallback`, `server/src/services/microsoftOAuth.service.js`, `server/src/services/auth.service.js`'s `findOrCreateMicrosoftUser`).

## Conventions

- **Base URL:** `/api/ai` (the Vite dev server proxies `/api` to `http://localhost:4000`).
- **Auth:** an httpOnly `token` cookie set at login; every request is sent with `credentials: "include"`. **Every** endpoint below requires an authenticated **and active** (paid) account — `router.use(requireAuth, requireActiveAccount)` is applied to the whole `ai.routes.js` router.
- **Response envelope (every endpoint):**

```json
{ "success": true,  "data": { } }
{ "success": false, "error": { "message": "…", "code": "…", "details": {} } }
```

`details` is only present on `400` validation failures and is the flattened zod error (`{ formErrors, fieldErrors }`).

---

## 1. `POST /api/ai/analyze`

Sends 1–10 shortlisted stocks to the configured AI model and returns a qualitative analysis. A **single** stock returns a free-text write-up; **two or more** return a structured head-to-head comparison. Best-effort persists the run to the caller's history (`ai_analysis` table) before responding — a persistence failure does not fail the request.

- **Auth:** required + active
- **Request body:**

```json
{
  "stocks": [
    {
      "exchangeCode": "SGX",
      "stockCode": "D05",
      "stockName": "DBS Group Holdings",
      "values": { "marketCap": 95000000000, "peRatio": 9.8 }
    }
  ]
}
```

  - `stocks`: required, array, 1–10 items.
  - `stocks[].exchangeCode`, `stockCode`, `stockName`: required, non-empty strings.
  - `stocks[].values`: optional map of metric name → number (screener values, passed through to the prompt for context).

- **Success `200`** — single stock (`mode: "single"`):

```json
{
  "success": true,
  "data": {
    "mode": "single",
    "analysis": "DBS Group Holdings: DBS continues to post steady net interest income growth... This is not financial advice."
  }
}
```

- **Success `200`** — two or more stocks (`mode: "comparison"`):

```json
{
  "success": true,
  "data": {
    "mode": "comparison",
    "analysis": {
      "stocks": ["DBS Group Holdings", "OCBC Bank"],
      "criteria": [
        {
          "name": "Growth outlook",
          "notes": ["Steady loan book growth.", "Modest but stable growth."],
          "winner": "DBS Group Holdings"
        }
      ],
      "summary": "Both are stable Singapore banks; DBS edges ahead on growth momentum.",
      "disclaimer": "This is not financial advice."
    }
  }
}
```

- **Errors:**
  - `400` — `stocks` missing/empty/more than 10 items, or a stock object missing a required field.
  - `401` / `402` — see Conventions.
  - `500` — the AI provider call failed (missing `AI_RECOMMENDATION_API_KEY` / `OPENROUTER_API_KEY`, non-2xx response, empty response text) or, for comparisons, the model's response wasn't valid/expected JSON.

---

## 2. `GET /api/ai/history`

Returns the logged-in user's saved analysis runs, latest first.

- **Auth:** required + active
- **Success `200`:**

```json
{
  "success": true,
  "data": {
    "history": [
      {
        "id": "3f6a9e2a-1234-4c56-9abc-1234567890ab",
        "title": "D05, O39 +1 more",
        "stocks": [
          { "exchangeCode": "SGX", "stockCode": "D05", "stockName": "DBS Group Holdings" }
        ],
        "analysisText": "DBS Group Holdings: ...",
        "createdAt": "2026-07-30T09:12:00.000Z"
      }
    ]
  }
}
```

  `analysisText` is the raw stored text — for comparison-mode runs this is a JSON string the client `JSON.parse`s back into the comparison object; for single-mode runs it's the plain write-up.

- **Errors:** `401`, `402`, `500`.

---

## 3. `PATCH /api/ai/history/:id`

Renames a run and/or overwrites its analysis text. This is a user edit/annotation, **not** a re-run of the model. At least one of `title`/`analysisText` must be provided. Scoped to the logged-in user — a valid id belonging to someone else behaves as not-found.

- **Auth:** required + active
- **Path params:** `id` — the `ai_analysis.id` (UUID)
- **Request body** (at least one field required):

```json
{ "title": "SG Banks comparison", "analysisText": "Edited write-up text..." }
```

  - `title`: optional, trimmed, 1–200 characters.
  - `analysisText`: optional, trimmed, non-empty.

- **Success `200`:**

```json
{
  "success": true,
  "data": {
    "id": "3f6a9e2a-1234-4c56-9abc-1234567890ab",
    "title": "SG Banks comparison",
    "analysisText": "Edited write-up text..."
  }
}
```

- **Errors:**
  - `400` — neither field present, or a present field fails validation (empty/too long).
  - `401` / `402`.
  - `404` — `id` doesn't exist, or doesn't belong to the logged-in user.
  - `500`.

---

## 4. `DELETE /api/ai/history/:id`

Permanently deletes one saved analysis run. Scoped to the logged-in user.

- **Auth:** required + active
- **Path params:** `id` — the `ai_analysis.id` (UUID)
- **Success `200`:**

```json
{ "success": true, "data": { "id": "3f6a9e2a-1234-4c56-9abc-1234567890ab" } }
```

- **Errors:** `401`, `402`, `404` (doesn't exist / not owned by caller), `500`.

---

## 5. `GET /api/ai/preferences`

Returns the logged-in user's saved AI preferences, or the defaults if they've never saved any (`{ aiModelTier: "flash", aiPersona: "balanced", aiDetailLevel: "concise", customInstructions: "" }`).

- **Auth:** required + active
- **Success `200`:**

```json
{
  "success": true,
  "data": {
    "aiModelTier": "flash",
    "aiPersona": "balanced",
    "aiDetailLevel": "concise",
    "customInstructions": ""
  }
}
```

- **Errors:** `401`, `402`, `500`.

---

## 6. `PATCH /api/ai/preferences`

Upserts the caller's AI preferences (one row per user — `INSERT ... ON DUPLICATE KEY UPDATE`). Only the fields present in the body are changed; the rest keep their last-saved (or default) value. At least one field must be provided.

- **Auth:** required + active
- **Request body** (at least one field required, all optional):

```json
{
  "aiModelTier": "claude-haiku",
  "aiPersona": "growth",
  "aiDetailLevel": "detailed",
  "customInstructions": "Favor long-term dividend stability over short-term momentum."
}
```

  - `aiModelTier`: one of `"flash"`, `"gpt-4o-mini"`, `"claude-haiku"`, `"deepseek-chat"`.
  - `aiPersona`: one of `"balanced"`, `"conservative"`, `"growth"`, `"income"`.
  - `aiDetailLevel`: one of `"concise"`, `"detailed"`.
  - `customInstructions`: trimmed string, max 1000 characters.

- **Success `200`** — the full, merged preferences object (same shape as endpoint 5):

```json
{
  "success": true,
  "data": {
    "aiModelTier": "claude-haiku",
    "aiPersona": "growth",
    "aiDetailLevel": "detailed",
    "customInstructions": "Favor long-term dividend stability over short-term momentum."
  }
}
```

- **Errors:**
  - `400` — no fields provided, an enum field has an invalid value, or `customInstructions` exceeds 1000 characters.
  - `401` / `402`.
  - `500`.

---

## Error codes

| Status | `error.code` | When | How the client reacts |
|---|---|---|---|
| `400` | — | Invalid request body (see per-endpoint validation above) | Inline error, request not retried automatically |
| `401` | — | Missing / invalid / expired session cookie | Redirect to `/login` |
| `402` | `ACCOUNT_INACTIVE` | Logged in but subscription not active | Redirect to `/activate` |
| `404` | — | History entry doesn't exist or isn't owned by the caller | Inline error; entry stays in the visible list |
| `500` | — | AI provider call failed, DB error, or unexpected server error | Inline error; message preserved (e.g. names the missing env var) |

All error bodies follow `{ "success": false, "error": { "message": string, "code"?: string, "details"?: object } }`. The shared client wrapper (`client/src/api/client.js`) throws `error.message`, which each page renders directly.

---

## Integration notes

1. **Model/provider configuration is server-side only.** Which provider (`gemini` vs `openrouter`) and which underlying model a tier maps to lives in `MODEL_TIERS` (`ai.service.js`) — the client only ever sends/receives the tier id string (`"flash"`, `"gpt-4o-mini"`, etc.), never a raw model name or API key.
2. **Environment variables required:** `AI_RECOMMENDATION_API_KEY` (Google Gemini, used for the default `"flash"` tier) and `OPENROUTER_API_KEY` (OpenRouter, used for `"gpt-4o-mini"`, `"claude-haiku"`, `"deepseek-chat"`) — see `server/.env.example`. Analysis requests fail with `500` if the key for the selected tier is missing.
3. **`values` on each stock in `POST /api/ai/analyze` is optional but recommended** — it's the screener metric values (market cap, P/E, etc.) that get woven into the prompt so the model's reasoning ties back to *why* the stock passed the screen, not just its name.

---

# Google OAuth ("Sign in with Google")

Lets a user log in (or, on first use, sign up) with their Google account instead of an email/password. Implemented in `server/src/routes/auth.routes.js` (`/oauth/google*`), `server/src/controllers/auth.controller.js` (`googleOAuthStart`/`googleOAuthCallback`), `server/src/services/googleOAuth.service.js` (talking to Google), and `server/src/services/auth.service.js`'s `findOrCreateGoogleUser` (matching/creating the local account).

## Conventions

Unlike every other endpoint in this document, these two are **not** JSON APIs — they're full-page browser navigations (the client's Google button, `client/src/pages/Login.jsx`, is a plain `<a href="/api/auth/oauth/google">`, not a `fetch` call), because the browser has to actually visit Google's consent screen. Both routes always respond with an HTTP redirect, never a JSON body.

## 1. `GET /api/auth/oauth/google`

Starts the flow. Generates a random CSRF `state` value, stores it in a short-lived (5 minute) httpOnly cookie (`g_oauth_state`), and redirects the browser to Google's OAuth 2.0 consent screen (`accounts.google.com/o/oauth2/v2/auth`) with `client_id`/`redirect_uri` from `GOOGLE_CLIENT_ID`/`GOOGLE_REDIRECT_URI`, `scope=openid email profile`, `prompt=select_account`, and that same `state`.

- **Auth:** none (this *is* the login entry point).
- **Rate limit:** `loginLimiter` (same as `POST /auth/login`).
- **Response:** `302` to Google. On misconfiguration (e.g. `GOOGLE_CLIENT_ID` unset), `302` back to `/login?oauth=error&message=...` instead of throwing a raw `500`.

## 2. `GET /api/auth/oauth/google/callback`

Where Google redirects the browser back to after the user grants or denies consent. Must exactly match `GOOGLE_REDIRECT_URI` as configured in the Google Cloud Console.

- **Auth:** none.
- **Rate limit:** `loginLimiter`.
- **Query params (from Google):** `code` (authorization code, present on consent) *or* `error` (e.g. `access_denied`, present on denial), plus the `state` echoed back unchanged.
- **Main flow:**
  1. Clears the `g_oauth_state` cookie unconditionally (single-use).
  2. If `error` is present, or `code`/`state` is missing, or `state` doesn't match the cookie (CSRF check) → redirect to `/login?oauth=error&message=<reason>`. `exchangeCodeForProfile`/`findOrCreateGoogleUser` are never called in this branch.
  3. Otherwise: exchanges `code` for an access token, fetches the verified Google profile (`sub`, `email`, `email_verified`, `name`, `picture`) via `googleOAuth.service.js`'s `exchangeCodeForProfile`.
  4. `authService.findOrCreateGoogleUser(profile)` matches an existing account by `google_id`, else links onto an existing password account by (Google-verified) email, else creates a brand-new account with no password.
  5. Issues a normal session JWT (`authService.issueToken`) and sets it on the same httpOnly `token` cookie password login uses — **no email-OTP second factor** here, since Google has already authenticated the user.
  6. Redirects to `${OAUTH_SUCCESS_REDIRECT}/login?oauth=success`.
- **Response:**
  - **Success:** `302` to `/login?oauth=success` + the `token` session cookie set. The client then calls `GET /api/auth/me` to fetch the now-logged-in user (see `client/src/pages/Login.jsx`).
  - **Failure** (denied consent, CSRF mismatch, missing code, failed token exchange, unverified email, DB error): `302` to `/login?oauth=error&message=<human-readable reason>`. No cookie is set.

## Error handling

| Situation | Redirect target | Notes |
|---|---|---|
| User clicks "Cancel" on Google's consent screen | `/login?oauth=error&message=Google+sign-in+was+cancelled` | Google sends `?error=access_denied` |
| `state` cookie missing/expired or doesn't match | `/login?oauth=error&message=Google+sign-in+session+expired...` | CSRF protection — see `googleOAuth.service.js`'s `generateOAuthState()` doc comment |
| Google account has no verified email | `/login?oauth=error&message=Google+sign-in+failed...` | `exchangeCodeForProfile` rejects before any DB write |
| Token exchange / profile fetch HTTP failure | `/login?oauth=error&message=Google+sign-in+failed...` | Logged server-side with the real error; client only sees the generic message |
| Everything else (DB error, etc.) | `/login?oauth=error&message=Google+sign-in+failed...` | Same generic message, real error logged as `[auth] googleOAuthCallback failed: ...` |

## Integration notes

1. **No Google JS SDK on the client.** This is the classic server-side OAuth 2.0 authorization code flow — the "Continue with Google" button is a plain link, not a `google.accounts.id.initialize(...)` call.
2. **Environment variables required:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `OAUTH_SUCCESS_REDIRECT` — see `server/.env.example` for how to obtain them from the Google Cloud Console.
3. **Account linking is by verified email, not user choice.** If someone already has a password account under `ada@example.com` and signs in with a Google account using that same address, the two are silently merged (the Google id is attached to the existing account) rather than erroring or creating a duplicate — safe because Google has already verified ownership of that address.
4. **Google-only accounts have `password_hash = NULL`** (migration `014_add_google_oauth.sql`) — they can't use `POST /auth/login` until/unless a "set a password" flow is added; today, Google is their only way in.

---

# Microsoft OAuth ("Sign in with Microsoft")

The same idea as Google OAuth above, against a Microsoft (personal or work/school Azure AD) account instead — same authorization-code flow, same `users` table, same account-linking-by-email behavior, deliberately kept as close to a copy-paste of the Google implementation as the two providers' APIs allow. Implemented in `server/src/routes/auth.routes.js` (`/oauth/microsoft*`), `server/src/controllers/auth.controller.js` (`microsoftOAuthStart`/`microsoftOAuthCallback`), `server/src/services/microsoftOAuth.service.js` (talking to the Microsoft identity platform + Microsoft Graph), and `server/src/services/auth.service.js`'s `findOrCreateMicrosoftUser` (matching/creating the local account).

## Conventions

Same as Google OAuth above: these two routes are full-page browser navigations, not JSON APIs (the client's Microsoft button, `client/src/pages/Login.jsx`, is a plain `<a href="/api/auth/oauth/microsoft">`), and both always respond with an HTTP redirect.

## 1. `GET /api/auth/oauth/microsoft`

Starts the flow. Generates a random CSRF `state` value, stores it in a short-lived (5 minute) httpOnly cookie (`ms_oauth_state` — a separate cookie name from Google's `g_oauth_state`, so a flow started against one provider can't be completed against the other's callback), and redirects the browser to the Microsoft identity platform's consent screen (`login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize`, tenant from `MS_TENANT_ID`, default `common`) with `client_id`/`redirect_uri` from `MS_CLIENT_ID`/`MS_REDIRECT_URI`, `scope=openid email profile User.Read`, `prompt=select_account`, and that same `state`.

- **Auth:** none (this *is* a login entry point).
- **Rate limit:** `loginLimiter` (same as `POST /auth/login`).
- **Response:** `302` to Microsoft. On misconfiguration (e.g. `MS_CLIENT_ID` unset), `302` back to `/login?oauth=error&message=...` instead of throwing a raw `500`.

## 2. `GET /api/auth/oauth/microsoft/callback`

Where Microsoft redirects the browser back to after the user grants or denies consent. Must exactly match `MS_REDIRECT_URI` as configured on the app registration in the Azure portal.

- **Auth:** none.
- **Rate limit:** `loginLimiter`.
- **Query params (from Microsoft):** `code` (authorization code, present on consent) *or* `error` (e.g. `access_denied`, present on denial), plus the `state` echoed back unchanged.
- **Main flow:**
  1. Clears the `ms_oauth_state` cookie unconditionally (single-use).
  2. If `error` is present, or `code`/`state` is missing, or `state` doesn't match the cookie (CSRF check) → redirect to `/login?oauth=error&message=<reason>`. `exchangeCodeForProfile`/`findOrCreateMicrosoftUser` are never called in this branch.
  3. Otherwise: exchanges `code` for an access token, then fetches the profile (`id`, `mail`, `userPrincipalName`, `displayName`) from Microsoft Graph's `/me` via `microsoftOAuth.service.js`'s `exchangeCodeForProfile`.
  4. `authService.findOrCreateMicrosoftUser(profile)` matches an existing account by `microsoft_id`, else links onto an existing account by email, else creates a brand-new account with no password.
  5. Issues a normal session JWT (`authService.issueToken`) and sets it on the same httpOnly `token` cookie password login uses — **no email-OTP second factor** here, same reasoning as Google: Microsoft has already authenticated the user.
  6. Redirects to `${OAUTH_SUCCESS_REDIRECT}/login?oauth=success`.
- **Response:**
  - **Success:** `302` to `/login?oauth=success` + the `token` session cookie set. The client then calls `GET /api/auth/me` to fetch the now-logged-in user (see `client/src/pages/Login.jsx`) — the exact same code path Google's success redirect uses, since both providers redirect to the same `?oauth=success` contract.
  - **Failure** (denied consent, CSRF mismatch, missing code, failed token/profile fetch, no usable email, DB error): `302` to `/login?oauth=error&message=<human-readable reason>`. No cookie is set.

## Error handling

| Situation | Redirect target | Notes |
|---|---|---|
| User clicks "Cancel" on Microsoft's consent screen | `/login?oauth=error&message=Microsoft+sign-in+was+cancelled` | Microsoft sends `?error=access_denied` |
| `state` cookie missing/expired or doesn't match | `/login?oauth=error&message=Microsoft+sign-in+session+expired...` | CSRF protection — see `microsoftOAuth.service.js`'s `generateOAuthState()` doc comment |
| Microsoft account has no usable email (`mail`/`userPrincipalName` both absent) | `/login?oauth=error&message=Microsoft+sign-in+failed...` | `exchangeCodeForProfile` rejects before any DB write |
| Token exchange / Graph profile fetch HTTP failure | `/login?oauth=error&message=Microsoft+sign-in+failed...` | Logged server-side with the real error; client only sees the generic message |
| Everything else (DB error, etc.) | `/login?oauth=error&message=Microsoft+sign-in+failed...` | Same generic message, real error logged as `[auth] microsoftOAuthCallback failed: ...` |

## Integration notes

1. **No MSAL JS SDK on the client.** Same reasoning as Google — the "Continue with Microsoft" button is a plain link, not a `msal.loginRedirect(...)` call.
2. **Environment variables required:** `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID` (default `common`), `MS_REDIRECT_URI`, plus the already-shared `OAUTH_SUCCESS_REDIRECT` — see `server/.env.example` for how to obtain them from an Azure Entra ID app registration.
3. **Account linking is by email, same as Google**, with one caveat: Microsoft Graph doesn't expose a Google-style `email_verified` flag on `/me`. `mail` (the account's real mailbox, verified by Microsoft or the org) is preferred; `userPrincipalName` (the sign-in identifier, typically email-shaped) is only used as a fallback for Azure AD accounts that have no mailbox assigned. This is a materially weaker guarantee than Google's explicit `email_verified: true` check — see Database Schema doc for the accepted risk.
4. **No profile photo is fetched.** Unlike Google's `picture` field, Microsoft Graph requires a separate binary call (`/me/photo/$value`) to get an avatar; out of scope for this pass, so Microsoft-created accounts always start with `avatar = NULL` (same as any account with no photo set).
5. **Microsoft-only accounts have `password_hash = NULL`**, same as Google-only accounts (migration `015_add_microsoft_oauth.sql`) — they can't use `POST /auth/login` until/unless a "set a password" flow is added; today, Microsoft is their only way in.
