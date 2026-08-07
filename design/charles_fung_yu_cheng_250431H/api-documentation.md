# API Documentation — Subscription/Paywall & Admin Dashboard

**Owner:** Charles (Person 2)

Two routers: (1) the **subscription/paywall** API — subscribing via Stripe Checkout (test mode), reading status, cancelling/resuming, the billing portal, payment history, and the Stripe webhook that keeps everything in sync (`server/src/routes/subscription.routes.js`, `server/src/controllers/subscription.controller.js`, `server/src/services/subscription.service.js`); and (2) the **admin dashboard** API — user management, stats, exports and control of the data-ingestion pipeline (`server/src/routes/admin.routes.js`, `server/src/controllers/admin.controller.js`, `server/src/services/{admin,ingestion}.service.js`). The offline Python ingestion pipeline (`ingestion/`) has no HTTP surface of its own — it's driven directly (`python ingest.py`) or through the admin reseed endpoints below.

## Conventions

- **Base URLs:** `/api/subscription` and `/api/admin` (the Vite dev server proxies `/api` to `http://localhost:4000`).
- **Auth:** an httpOnly `token` cookie set at login; every request is sent with `credentials: "include"`.
  - `/api/subscription/*` requires `requireAuth` **only** — deliberately *not* `requireActiveAccount`, so an inactive user can subscribe. The one exception is the webhook, which has no auth cookie (see below).
  - `/api/admin/*` requires `requireAuth` **and** `requireAdmin` (`is_admin = 1`) — but *not* `requireActiveAccount`, so an admin is never locked out by their own paywall status.
- **Response envelope (every JSON endpoint):**

```json
{ "success": true,  "data": { } }
{ "success": false, "error": { "message": "…", "code": "…", "details": {} } }
```

CSV/PDF export endpoints stream a file (`Content-Disposition: attachment`) rather than the JSON envelope.

- **Money:** amounts are integer **cents** (`amount_cents`); the subscription fee is `999` (S$9.99). Currency codes are ISO ("SGD"/"USD").

---

# Subscription / Paywall — `/api/subscription`

## 1. `GET /api/subscription/status`
Current subscription state for the logged-in user, used by `/activate` and `/settings`.
- **Auth:** required (not active-gated)
- **Response `data`:**
```json
{
  "isActive": true,
  "subscriptionStatus": "active",
  "currentPeriodEnd": "2026-09-07T00:00:00.000Z",
  "cancelAtPeriodEnd": false,
  "subscriptionFee": 999
}
```
- **Errors:** `404` if the user record is gone.

## 2. `POST /api/subscription/checkout-session`
Creates a Stripe Checkout Session (mode `subscription`, S$9.99/month) and returns its hosted URL.
- **Auth:** required
- **Request body:** none.
- **Response `data`:** `{ "url": "https://checkout.stripe.com/c/pay/..." , "sessionId": "cs_test_..." }` — status `201`.
- **Errors:** `409` if already active; `500` if `STRIPE_SECRET_KEY` is not configured.

## 3. `GET /api/subscription/verify-session?session_id=cs_test_...`
Confirms a returning Checkout session and activates the account if it was paid (idempotent with the webhook).
- **Auth:** required
- **Query:** `session_id` (required).
- **Response `data`:** the same shape as `GET /status`, reflecting the now-active account.
- **Errors:** `400` if `session_id` is missing.

## 4. `POST /api/subscription/billing-portal`
Returns a Stripe hosted billing-portal URL (invoices, payment method, cancellation).
- **Auth:** required
- **Response `data`:** `{ "url": "https://billing.stripe.com/p/session/..." }`
- **Errors:** `400` if the user has no Stripe customer yet.

## 5. `POST /api/subscription/cancel`
Schedules cancellation at period end (`cancel_at_period_end = true`) — access is kept through the already-paid period.
- **Auth:** required
- **Response `data`:** updated status (`cancelAtPeriodEnd: true`, `currentPeriodEnd` unchanged).
- **Errors:** `400` if there's no active subscription to cancel.

## 6. `POST /api/subscription/resume`
Undoes a scheduled cancellation before it lapses (`cancel_at_period_end = false`).
- **Auth:** required
- **Response `data`:** updated status (`cancelAtPeriodEnd: false`).
- **Errors:** `400` if nothing is scheduled to cancel / already lapsed.

## 7. `GET /api/subscription/payments`
The caller's own payment history, latest first.
- **Auth:** required
- **Response `data`:**
```json
[
  { "id": "…", "amountCents": 999, "currency": "SGD", "status": "succeeded",
    "paymentMethod": "card", "paidAt": "2026-08-07T09:00:00.000Z" }
]
```

## 8. `POST /api/subscription/webhook`
**Stripe → server only.** Mounted with `express.raw({ type: "application/json" })` (before the JSON body parser) so the raw bytes survive for signature verification.
- **Auth:** none — verified instead via the `Stripe-Signature` header against `STRIPE_WEBHOOK_SECRET` (`constructWebhookEvent`).
- **Handled events:** `checkout.session.completed`, `invoice.paid` (records a `payment` row, `INSERT IGNORE` on `stripe_invoice_id`), `customer.subscription.updated`, `customer.subscription.deleted` (syncs `is_active` / `subscription_status` / `current_period_end` / `cancel_at_period_end`).
- **Response:** `{ "received": true }` on success; `400 Webhook Error: <msg>` on a bad/absent signature.

---

# Admin Dashboard — `/api/admin`
All endpoints require `requireAuth` + `requireAdmin`. A non-admin gets `403`.

## 9. `GET /api/admin/stats`
Summary tiles for the dashboard.
- **Response `data`:** `{ "totalUsers": n, "activeUsers": n, "inactiveUsers": n, "admins": n, "totalRevenueCents": n, "paymentsCount": n }` (revenue sums the `payment` table, including anonymized rows from deleted accounts).

## 10. `GET /api/admin/users`
Every account with status flags.
- **Response `data`:** `[{ id, email, name, isActive, isAdmin, subscriptionStatus, currentPeriodEnd, createdAt }, …]`

## 11. `POST /api/admin/users`
Provisions an account directly (bypasses self-signup/paywall).
- **Request body:** `{ "email": "…", "password": "…", "name": "…", "isActive": false, "isAdmin": false }` (`isActive`/`isAdmin` optional).
- **Response `data`:** the created user — `201`.
- **Errors:** `400` on validation failure; `409` if the email already exists.

## 12. `POST /api/admin/users/:id/revoke`  ·  `POST /api/admin/users/:id/restore`
Set `is_active = 0` / `1` respectively. Response: the updated user.

## 13. `DELETE /api/admin/users/:id`
Hard-deletes an account (irreversible): cancels any live Stripe subscription, removes the user's own data, but **keeps `payment` rows anonymized** (`ON DELETE SET NULL`). Response: `{ "deleted": true }`.

## 14. `POST /api/admin/users/:id/admin`
Promote/demote. **Request body:** `{ "isAdmin": true|false }`. Guards against removing the last remaining admin.

## 15. `GET /api/admin/users/:id/payments`
That user's payment rows (same row shape as endpoint 7).

## 16. Exports
- `GET /api/admin/export/users.csv` — all users as CSV.
- `GET /api/admin/export/payments.csv` — all payments as CSV.
- `GET /api/admin/export/summary.pdf` — a summary report PDF.

All three stream a file download (`Content-Disposition: attachment`), not the JSON envelope.

## 17. Data-pipeline control
- `POST /api/admin/cache/clear` — invalidate the in-memory stock cache (`utils/cache.js`). Response `{ "cleared": true }`.
- `POST /api/admin/reseed` — launch the ingestion pipeline (`ingestion/ingest.py`) server-side to pull fresh Yahoo Finance data. Response `{ "started": true }` (or reports an already-running run).
- `GET /api/admin/reseed/status` — progress/output of the in-flight (or last) reseed: `{ "running": bool, "output": "…", "lastReseedAtMs": 1725700000000 }`.
- `GET /api/admin/reseed/schedule` — `{ "intervalHours": 24|null, "nextRunAtMs": 1725786400000|null }`.
- `POST /api/admin/reseed/schedule` — **body:** `{ "intervalHours": 24 }` (or `null` to disable auto-reseed).

---

## Data-ingestion pipeline (no HTTP surface)
`ingestion/ingest.py` connects to MySQL directly (`ingestion/db.py`, credentials from `ingestion/.env`, mirroring `server/.env`) and upserts into `exchange`/`stock`/`daily_price`/`market_cap`/`dividend`/`financials`. It reads its stock universe from `tickers.py` (fixed list) or `universe.py` (dynamic, `USE_DYNAMIC_UNIVERSE=true`). It is run manually (`python ingest.py`) or indirectly via the admin reseed endpoints above. Known data caveats (unofficial Yahoo API, EBITDA-as-EBITA proxy, NULL `listed_date`, per-currency dividend cents) are documented in `ingestion/README.md`.
