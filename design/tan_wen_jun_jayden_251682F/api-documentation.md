# API Documentation — Watchlist & Notifications

**Owner:** Person 5 · **Features:** the Watchlist page and the Twilio WhatsApp alert channel.

The endpoints my Watchlist page uses, plus the Twilio WhatsApp service that sends alerts. Everything is mounted under `/api/notifications` and gated by `requireAuth` + `requireActiveAccount`, so every call needs a logged-in, **active** account.

## Conventions

- **Base URL:** `/api` (Vite dev server proxies to `http://localhost:4000`).
- **Auth:** httpOnly `token` cookie from login; requests send `credentials: "include"`.
- **Response envelope:**

```json
{ "success": true,  "data": … }
{ "success": false, "error": { "message": "…" } }
```

---

## 1. `GET /api/notifications/watchlist`

Lists the current user's watchlist, joined to `stock` for the display name.

- **Auth:** required + active
- **Success `200`** — note the fields come back in **snake_case** (raw column names):

```json
{
  "success": true,
  "data": [
    {
      "id": "6f1c…",
      "exchange_code": "NASDAQ",
      "stock_code": "AAPL",
      "saved_criteria_set_id": "b2a9…",
      "channel": "whatsapp",
      "created_at": "2026-01-20T08:15:00.000Z",
      "stock_name": "Apple Inc."
    }
  ]
}
```

- **Errors:** `401`, `402`, `500`.

## 2. `POST /api/notifications/watchlist`

Adds a stock to the watchlist. If `channel` is `whatsapp` and a `recipientNumber` is supplied, a best-effort Twilio confirmation message is sent (a send failure does **not** fail the request — the row is still saved).

- **Auth:** required + active
- **Request body:**

```json
{
  "exchangeCode": "NASDAQ",
  "stockCode": "AAPL",
  "savedCriteriaSetId": "b2a9…",   // optional — attach a saved screen for pass/fail
  "channel": "whatsapp",            // optional — "whatsapp" | "telegram" | "email"; defaults to "whatsapp"
  "recipientNumber": "+6591234567"  // optional — WhatsApp number for the confirmation
}
```

- **Success `201`** (fields returned in **camelCase**):

```json
{
  "success": true,
  "data": { "id": "6f1c…", "exchangeCode": "NASDAQ", "stockCode": "AAPL", "savedCriteriaSetId": "b2a9…", "channel": "whatsapp" }
}
```

- **Errors:**
  - `400` — missing `exchangeCode`/`stockCode`, invalid `channel`, or unknown stock / saved-criteria-set (FK failure → "Unknown stock or saved criteria set").
  - `401`, `402`, `500`.

## 3. `DELETE /api/notifications/watchlist/:id`

Removes one of the user's watchlist items (scoped by `user_id`, so you can't delete someone else's).

- **Auth:** required + active
- **Success `204`** — empty body.
- **Errors:** `404` (item not found / not yours), `401`, `402`, `500`.

## 4. `POST /api/notifications/ai-recommendation`

Optional AI step (requirement doc section 6). Not implemented in this pass.

- **Response `501`** — `{ "success": false, "error": { "message": "Not implemented: getAiRecommendation (optional feature)" } }`

---

## Twilio WhatsApp service (internal)

Not an HTTP endpoint — a service (`whatsapp.service.js`) the watchlist flow calls to send alerts. Configured via env vars:

| Env var | Purpose |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_WHATSAPP_FROM` | Sender, e.g. `whatsapp:+14155238886` (sandbox or approved number) |
| `WHATSAPP_DRY_RUN` | `true` logs the payload instead of calling Twilio (for local dev) |

**`sendWhatsAppMessage(toNumber, body)`** — normalises the recipient to `whatsapp:<number>`, then: throws if `TWILIO_WHATSAPP_FROM` is unset; returns `{ sid: "dry-run", status: "queued" }` without a network call when `WHATSAPP_DRY_RUN=true`; otherwise sends via Twilio and returns `{ sid, status }`. Also exposes `normalizeWhatsAppRecipient`, `resolveWhatsAppSender`, and `buildWatchlistAlertText` helpers.

---

## Error codes summary

| Status | When | Message |
|---|---|---|
| `400` | Missing/invalid body, or unknown stock / criteria set (FK) | field-specific |
| `401` | Not authenticated | — |
| `402` | Logged in but inactive/unpaid | `ACCOUNT_INACTIVE` |
| `404` | Watchlist item not found on DELETE | "Watchlist item not found" |
| `500` | Unexpected server/DB error | generic |
| `501` | AI recommendation (optional, not implemented) | — |

## Implementation notes

- The list endpoint returns snake_case fields while the add endpoint returns camelCase — the Watchlist page reads snake_case from the list (`item.exchange_code`, `item.saved_criteria_set_id`). Worth normalising to one casing later.
- **`twilio` must be a declared dependency** in `server/package.json` (`whatsapp.service.js` imports it). If it's missing, the server crashes on import — add it with `npm install twilio`.