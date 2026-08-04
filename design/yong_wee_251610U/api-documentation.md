# API Documentation — AI Stock Analysis

**Owner:** Yong Wee (Person 1)

Endpoints for the AI qualitative-analysis feature: running an analysis on shortlisted stocks, managing saved analysis history, and reading/updating a user's AI preferences. Implemented in `server/src/routes/ai.routes.js`, `server/src/controllers/{ai,aiPreferences}.controller.js`, and `server/src/services/{ai,aiHistory,aiPreferences}.service.js`.

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
