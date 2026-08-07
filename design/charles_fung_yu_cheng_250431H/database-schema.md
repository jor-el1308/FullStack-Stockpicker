# Database Schema — Data Pipeline, Subscription/Paywall & Admin

**Owner:** Charles (Person 2)

I own the database design itself (`server/src/db/schema.sql`) plus the tables/columns behind three features. The **data-pipeline** tables hold the stock universe and its time-series/financial data (populated by `ingestion/ingest.py`). The **subscription/paywall** owns the `payment` table and the subscription columns bolted onto the shared `users` table. The **admin dashboard** reads across those and owns the `reseed_schedule` config table plus the `is_admin` flag. Column names below are the raw SQL names; the API layer aliases them to camelCase (e.g. `amount_cents` → `amountCents`). Introduced by `schema.sql` and migrations `001_add_subscription`, `002_add_admin_flag`, `005_add_stripe_subscription`, `006_add_reseed_schedule`, `007_add_account_deletion`, `010_add_last_reseed_at`.

## Tables I own

| Table | Group | Purpose |
|---|---|---|
| `exchange` | Data pipeline | Reference list of exchanges (SGX/NYSE/NASDAQ) + currency. |
| `stock` | Data pipeline | Stock code → name lookup + sector / listed date / active flag. |
| `daily_price` | Data pipeline | Daily OHLC + volume time series. |
| `market_cap` | Data pipeline | Market-cap history ("latest" = max `as_of_date`). |
| `dividend` | Data pipeline | Dividend declared per year, in cents. |
| `financials` | Data pipeline | Revenue / PBT / PAT / EBITA per year. |
| `payment` | Subscription | One row per successful charge (first invoice + renewals). |
| `users` (subscription + admin cols) | Subscription / Admin | Paywall/subscription state and the `is_admin` flag (table itself is shared with Person 1's auth). |
| `reseed_schedule` | Admin / pipeline | Single-row config for the auto-reseed toggle + last-run timestamp. |

`login_otp` (login 2FA) was also added by me on top of Person 1's auth flow, but it belongs conceptually to auth, so it's documented in the auth feature rather than here.

---

## Data-pipeline tables

### `exchange` — reference data
| Column | Type | Null | Key | Notes |
|---|---|---|---|---|
| `exchange_code` | VARCHAR(16) | No | PK | e.g. `SGX`, `NASDAQ`, `NYSE` |
| `exchange_name` | VARCHAR(128) | No | | |
| `country` | VARCHAR(64) | Yes | | |
| `currency` | VARCHAR(8) | No | | `DEFAULT 'USD'` |

### `stock` — stock lookup + metadata (requirement §4)
| Column | Type | Null | Key | Notes |
|---|---|---|---|---|
| `exchange_code` | VARCHAR(16) | No | PK, FK → `exchange` | `ON DELETE CASCADE` |
| `stock_code` | VARCHAR(32) | No | PK | Composite PK `(exchange_code, stock_code)` |
| `stock_name` | VARCHAR(255) | No | INDEX `idx_stock_name` | |
| `sector` | VARCHAR(128) | Yes | | Drives the sector-exclusion filter |
| `listed_date` | DATE | Yes | | For the <5yo company-age exclusion; often NULL (Yahoo doesn't expose it reliably) |
| `is_active` | TINYINT(1) | No | | `DEFAULT 1` |
| `created_at` / `updated_at` | TIMESTAMP | No | | `updated_at` auto-updates |

### `daily_price` — OHLC time series (requirement §3c–3d)
Composite PK `(exchange_code, stock_code, price_date)`, FK → `stock` `ON DELETE CASCADE`, `INDEX idx_price_date`. Columns: `open`/`high`/`low`/`close` `DECIMAL(18,4)` NOT NULL, `volume` BIGINT. Fetched **incrementally** — only dates newer than the latest stored row per stock.

### `market_cap` — market-cap history (§3e)
Composite PK `(exchange_code, stock_code, as_of_date)`, FK → `stock` CASCADE. `market_cap DECIMAL(24,2)`. Kept as history so "latest" is just the max `as_of_date`.

### `dividend` — dividend per year (§3f)
Composite PK `(exchange_code, stock_code, year)`, FK → `stock` CASCADE. `dividend_cents DECIMAL(12,2)` — dividends summed per calendar year in the stock's local currency ×100 (see the cross-currency caveat in `ingestion/README.md`).

### `financials` — yearly financials (§3g–3j)
Composite PK `(exchange_code, stock_code, year)`, FK → `stock` CASCADE. Nullable `revenue` / `profit_before_tax` / `profit_after_tax` / `ebita` `DECIMAL(24,2)`. **EBITDA is stored in the `ebita` column** as the closest proxy Yahoo exposes (open question for the team).

---

## Subscription tables

### `payment` — successful charges
Backs both the user's own payment history and the admin revenue stats.

| Column | Type | Null | Key | Notes |
|---|---|---|---|---|
| `id` | CHAR(36) | No | PK | `DEFAULT (UUID())` |
| `user_id` | CHAR(36) | **Yes** | FK → `users(id)` | **`ON DELETE SET NULL`** — deleting an account *detaches* (anonymizes) its payments instead of erasing them, so revenue history survives (migration 007) |
| `amount_cents` | INT | No | | e.g. `999` |
| `currency` | VARCHAR(8) | No | | `DEFAULT 'USD'` |
| `status` | ENUM('succeeded','failed') | No | | `DEFAULT 'succeeded'` |
| `payment_method` | VARCHAR(32) | No | | `DEFAULT 'mock'` |
| `stripe_invoice_id` | VARCHAR(255) | Yes | **UNIQUE** | Nullable-unique so each Stripe invoice is recorded once even if the webhook is redelivered (`INSERT IGNORE`) |
| `paid_at` | TIMESTAMP | No | | `DEFAULT CURRENT_TIMESTAMP` |

### `users` — subscription & admin columns (I own these; the table is shared)
| Column | Type | Null | Notes |
|---|---|---|---|
| `is_active` | TINYINT(1) | No | `DEFAULT 0` — new accounts start inactive; this is what the paywall middleware checks. Mirrors whether the Stripe subscription is active/trialing. |
| `activated_at` | TIMESTAMP | Yes | When the account first went active |
| `stripe_customer_id` | VARCHAR(255) | Yes | Stripe customer handle |
| `stripe_subscription_id` | VARCHAR(255) | Yes | Stripe subscription handle |
| `subscription_status` | VARCHAR(32) | Yes | Mirrors Stripe's `Subscription.status` verbatim (`active`, `trialing`, `past_due`, `canceled`, …); NULL until first checkout |
| `current_period_end` | TIMESTAMP | Yes | End of the paid period; drives "renews/cancels on <date>" |
| `cancel_at_period_end` | TINYINT(1) | No | `DEFAULT 0` — 1 once a cancellation is scheduled but not yet effective; kept in sync by `syncSubscriptionFromStripeObject()` |
| `is_admin` | TINYINT(1) | No | `DEFAULT 0` — gates `/api/admin/*`; the first admin is bootstrapped by SQL (migration 002), never self-served |

---

## Admin / pipeline config

### `reseed_schedule` — single-row auto-reseed config
One row (`id` fixed at `1`) driving the admin dashboard's auto-reseed toggle.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | TINYINT | No | PK, `DEFAULT 1` — enforces a single config row |
| `interval_hours` | INT | Yes | NULL = auto-reseed disabled |
| `next_run_at_ms` | BIGINT | Yes | Epoch **ms** of the next scheduled run; NULL when disabled |
| `last_reseed_at_ms` | BIGINT | Yes | Epoch ms of the last successful reseed (manual or scheduled); NULL until the first run (migration 010) |
| `updated_at` | TIMESTAMP | No | Auto-updates |

Times are stored as plain epoch **milliseconds** (not `TIMESTAMP`) so the Node scheduler's `Date.now()` comparisons don't round-trip through MySQL's session timezone.

---

## Referential-integrity summary
- All data-pipeline children (`daily_price`, `market_cap`, `dividend`, `financials`) FK to `stock` with `ON DELETE CASCADE`; `stock` FKs to `exchange` with `ON DELETE CASCADE` — dropping an exchange cleanly removes its whole data subtree.
- `payment.user_id` uses **`ON DELETE SET NULL`** (the deliberate exception) so deleting a user anonymizes rather than erases revenue.
- The composite `(exchange_code, stock_code[, date/year])` primary keys make every ingestion write an idempotent upsert — re-running `ingest.py` never duplicates rows.
