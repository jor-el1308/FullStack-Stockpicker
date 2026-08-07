# Use Cases — Data Pipeline, Subscription/Paywall & Admin Dashboard

**Owner:** Charles (Person 2) · **Features:** the Yahoo Finance data-ingestion pipeline (`ingestion/`, `server/src/services/ingestion.service.js`), the Stripe subscription paywall (`server/src/{routes,controllers,services}/subscription.*`, `client/src/pages/Activate.jsx`, `client/src/pages/Settings.jsx`), and the Admin Dashboard (`server/src/{routes,controllers,services}/admin.*`, `server/src/middleware/admin.middleware.js`, `client/src/pages/Admin.jsx`).

Four groups of use cases. UC-01–UC-09 cover the **subscription/paywall**: a brand-new account starts inactive (`users.is_active = 0`) and must subscribe (S$9.99/month, recurring — `SUBSCRIPTION_FEE_CENTS = 999`) via Stripe Checkout (test mode) before it can reach anything past login; it can then view status, cancel (at period end), resume, manage billing, and see its payment history, with renewals/cancellations kept in sync by Stripe webhooks. UC-10–UC-18 cover the **admin dashboard**: an administrator (`users.is_admin = 1`) views summary stats and all users, revokes/restores/hard-deletes accounts, promotes/demotes admins, and exports data. UC-19–UC-22 cover the **data pipeline**: populating the stock database from Yahoo Finance, either by running the Python script directly or by triggering a reseed (manual or scheduled) from the admin panel.

## Actors

The paywall is enforced by `requireActiveAccount` (`server/src/middleware/subscription.middleware.js`), applied to the screener/dashboard/notifications routers. The subscription and admin routers are **deliberately excluded** from it — a user must be able to subscribe *before* being active, and an admin must not be locked out by their own paywall status.

| Actor | State | Access |
|---|---|---|
| **Visitor** | Not logged in | Blocked — API `401`, redirected to `/login` |
| **Inactive user** | Logged in, unpaid (`is_active = 0`) | Blocked from gated features (`402`/redirect to `/activate`); **can** reach `/api/subscription/*` to subscribe |
| **Subscriber** | Logged in, active (`is_active = 1`) | Full access to gated features + own subscription management |
| **Admin** | Logged in, `is_admin = 1` | Everything a Subscriber has **plus** `/api/admin/*` (not gated by `requireActiveAccount`) |
| **System** | Non-human | Stripe webhooks (renewals/cancellations) and the auto-reseed scheduler act with no user session |

`POST /api/subscription/webhook` is the odd one out: it carries **no auth cookie** and is instead verified by a Stripe signature (`constructWebhookEvent`), so its actor is Stripe itself, not a logged-in user.

---

## Subscription / Paywall

### UC-01 — Subscribe to activate a new account
- **Actor:** Inactive user
- **Trigger:** After signup/login the user lands on `/activate` and clicks **"Subscribe — S$9.99/month"**.
- **Preconditions:** Logged in; `is_active = 0`.
- **Main flow:**
  1. Client calls `POST /api/subscription/checkout-session`.
  2. Server ensures a Stripe customer exists for the user, creates a Checkout Session (mode `subscription`, the S$9.99/month price) and returns its `url`.
  3. The browser is redirected to Stripe's hosted Checkout page.
  4. The user pays with the test card `4242 4242 4242 4242` (any future expiry, any CVC).
  5. Stripe redirects back to the app's success URL with a `session_id` (see UC-02).
- **Postcondition:** A Checkout Session exists; activation is confirmed on return (UC-02) and/or by the `checkout.session.completed` / `invoice.paid` webhook (UC-09).
- **Alternate / edge flows:**
  - *E1 — Already active:* server returns `409`; UI shows the account is already subscribed.
  - *E2 — Stripe not configured (`STRIPE_SECRET_KEY` missing):* `500`, inline error explaining test-mode setup.
  - *E3 — User abandons Checkout:* no session completes, account stays inactive, user can retry.

### UC-02 — Confirm activation on return from Checkout
- **Actor:** Inactive user (returning)
- **Trigger:** Stripe redirects back to the success URL carrying `?session_id=...`.
- **Main flow:**
  1. Client calls `GET /api/subscription/verify-session?session_id=...`.
  2. Server retrieves the session from Stripe, and if paid, syncs the subscription onto the user (`is_active = 1`, `subscription_status`, `current_period_end`, `stripe_*` ids) and records the first `payment` row.
  3. Returns the updated subscription status; the client routes the now-active user into the app.
- **Postcondition:** `is_active = 1`; a `payment` row exists; a welcome email is sent best-effort.
- **Alternate flows:** *E1 — `session_id` missing:* `400`. *E2 — session not paid:* status returned unchanged; user stays inactive. (Activation is idempotent with the webhook — whichever arrives first wins, the other is a no-op.)

### UC-03 — Inactive user is blocked by the paywall
- **Actor:** Inactive user
- **Trigger:** Navigates to a gated page (screener, dashboard, watchlist) or its API.
- **Main flow:** `requireActiveAccount` rejects the API call with `402 ACCOUNT_INACTIVE`; the client redirects to `/activate`.
- **Postcondition:** No gated data is served until the account is active.

### UC-04 — View subscription status
- **Actor:** Subscriber / Inactive user
- **Trigger:** Opens `/settings` (or `/activate`).
- **Main flow:** `GET /api/subscription/status` returns `is_active`, `subscription_status`, `current_period_end`, `cancel_at_period_end`, and the `subscriptionFee`. UI renders the current plan state (active, "cancels on <date>", inactive).

### UC-05 — Cancel subscription (at period end)
- **Actor:** Subscriber
- **Trigger:** Clicks **"Cancel subscription"** in Settings.
- **Main flow:** `POST /api/subscription/cancel` sets Stripe's `cancel_at_period_end = true`; the account stays active through the already-paid period. `cancel_at_period_end` is mirrored locally; UI shows "cancels on <current_period_end>".
- **Postcondition:** Access is retained until `current_period_end`, then a `customer.subscription.deleted` webhook flips `is_active = 0` (UC-09).
- **Alternate flows:** *E1 — no active subscription:* `400`.

### UC-06 — Resume a scheduled cancellation
- **Actor:** Subscriber (who cancelled but hasn't lapsed)
- **Trigger:** Clicks **"Resume subscription"**.
- **Main flow:** `POST /api/subscription/resume` clears `cancel_at_period_end`; the subscription renews normally again.
- **Preconditions:** `cancel_at_period_end = 1` and the period hasn't ended yet.

### UC-07 — Manage billing via the Stripe portal
- **Actor:** Subscriber
- **Trigger:** Clicks **"Manage billing"**.
- **Main flow:** `POST /api/subscription/billing-portal` returns a Stripe hosted billing-portal URL for invoices / payment-method updates; the browser is redirected there and back.
- **Alternate flows:** *E1 — no Stripe customer yet:* `400`.

### UC-08 — View payment history
- **Actor:** Subscriber
- **Trigger:** Opens the billing section of Settings.
- **Main flow:** `GET /api/subscription/payments` returns the caller's `payment` rows (amount, currency, status, paid-at), latest first.

### UC-09 — Subscription lifecycle kept in sync (webhooks)
- **Actor:** System (Stripe)
- **Trigger:** Stripe delivers `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, or `customer.subscription.deleted` to `POST /api/subscription/webhook`.
- **Main flow:** The raw body is verified against the Stripe signature, then the handler syncs the subscription onto the user (`is_active`, `subscription_status`, `current_period_end`, `cancel_at_period_end`) and, for paid invoices, records a `payment` row (`INSERT IGNORE` on `stripe_invoice_id`, so redelivered webhooks don't double-count).
- **Postcondition:** Renewals keep the account active; failed renewals / cancellations deactivate it — without any user action.
- **Alternate flows:** *E1 — bad/absent signature or `STRIPE_WEBHOOK_SECRET` unset:* `400 Webhook Error`, nothing is applied.

---

## Admin Dashboard

### UC-10 — View summary stats
- **Actor:** Admin
- **Trigger:** Opens `/admin`.
- **Main flow:** `GET /api/admin/stats` returns totals (users, active/inactive counts, admins) and revenue summed from the `payment` table (including anonymized rows from deleted accounts).

### UC-11 — List all users
- **Actor:** Admin
- **Main flow:** `GET /api/admin/users` returns every account with its `is_active` / `is_admin` / subscription status.

### UC-12 — Revoke a user's access
- **Actor:** Admin
- **Trigger:** Clicks **Revoke** on a user row.
- **Main flow:** `POST /api/admin/users/:id/revoke` sets `is_active = 0`; that user is now paywalled on their next request.

### UC-13 — Restore a user's access
- **Actor:** Admin
- **Main flow:** `POST /api/admin/users/:id/restore` sets `is_active = 1`.

### UC-14 — Promote / demote an admin
- **Actor:** Admin
- **Main flow:** `POST /api/admin/users/:id/admin` with `{ isAdmin: true|false }`. Nobody can self-promote through the app — the *first* admin is bootstrapped by SQL (migration 002).
- **Alternate flows:** *E1 — demoting the last remaining admin* is guarded against so the system can't be locked out.

### UC-15 — Hard-delete an account
- **Actor:** Admin
- **Trigger:** Clicks **Delete** and confirms.
- **Main flow:** `DELETE /api/admin/users/:id` cancels any live Stripe subscription and removes the user's own data (saved screens, watchlists), but **keeps their `payment` rows, anonymized** (`ON DELETE SET NULL`) so revenue history survives. Irreversible.

### UC-16 — Create an admin-provisioned account
- **Actor:** Admin
- **Main flow:** `POST /api/admin/users` with `{ email, password, name, isActive?, isAdmin? }` creates an account directly (bypassing self-signup/paywall) — useful for seeding staff/demo accounts.

### UC-17 — View a user's payment history
- **Actor:** Admin
- **Main flow:** `GET /api/admin/users/:id/payments` returns that user's payments.

### UC-18 — Export data
- **Actor:** Admin
- **Main flow:** `GET /api/admin/export/users.csv`, `/export/payments.csv`, and `/export/summary.pdf` stream downloadable reports of the user base, payments, and a summary.

---

## Data Pipeline

### UC-19 — Populate the database from Yahoo Finance
- **Actor:** Developer / operator (offline)
- **Trigger:** Runs `python ingest.py` in `ingestion/`.
- **Main flow:** The script pulls OHLC prices, market cap, dividends and yearly financials (via `yfinance`) for either the fixed 15-ticker list (`tickers.py`) or a dynamic criteria-based universe (`universe.py`, when `USE_DYNAMIC_UNIVERSE=true`), and upserts them into `exchange`/`stock`/`daily_price`/`market_cap`/`dividend`/`financials`. Each ticker is committed in small independent chunks so one missing data category doesn't discard the rest. Daily-price fetching is incremental (only dates newer than what's stored).
- **Postcondition:** The screener has real data to filter over.
- **Alternate flows:** *E1 — a field is missing from Yahoo (e.g. IPO date, EBITA):* that column is left NULL / uses EBITDA as a proxy; the run continues.

### UC-20 — Trigger a manual reseed from the admin panel
- **Actor:** Admin
- **Trigger:** Clicks **Reseed data** in `/admin`.
- **Main flow:** `POST /api/admin/reseed` launches the ingestion pipeline server-side; `GET /api/admin/reseed/status` is polled to show progress/output; `last_reseed_at_ms` is recorded on success.
- **Alternate flows:** *E1 — a reseed is already running:* the status endpoint reports the in-flight run rather than starting a second.

### UC-21 — Configure auto-reseed schedule
- **Actor:** Admin
- **Main flow:** `POST /api/admin/reseed/schedule` with `{ intervalHours: number|null }` (null disables it) stores the interval in `reseed_schedule`; the scheduler re-runs ingestion on that cadence. `GET /api/admin/reseed/schedule` reads it back.

### UC-22 — Clear the stock-data cache
- **Actor:** Admin
- **Trigger:** Clicks **Clear cache** (typically right after a reseed).
- **Main flow:** `POST /api/admin/cache/clear` invalidates the in-memory stock cache (`server/src/utils/cache.js`) so freshly ingested data is served immediately.
