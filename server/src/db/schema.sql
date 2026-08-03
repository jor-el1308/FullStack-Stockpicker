-- Stock Screener Application - MySQL schema
-- Owner: Person 2 (Charles) - Data Collection & Database Design
--
-- Covers requirement doc section 3 (data points a-j), section 4 (stock
-- lookup table), and the auth/watchlist tables needed by Persons 1 and 5.
--
-- Run with:  npm run db:migrate --workspace=server
-- (or manually: mysql -u <user> -p <your DB_NAME> < server/src/db/schema.sql)
--
-- This file assumes a database has already been selected (migrate.js does
-- this dynamically based on the DB_NAME env var - it creates the database
-- first if missing, then connects with it selected, so nothing in this
-- file hardcodes a database name; that matters for managed hosts like
-- Aiven where the database already exists under a fixed name such as
-- `defaultdb`, not `stockpicker`).

-- ---------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------

-- 3a: Exchange
CREATE TABLE IF NOT EXISTS exchange (
  exchange_code VARCHAR(16) PRIMARY KEY,   -- e.g. 'SGX', 'NASDAQ', 'NYSE'
  exchange_name VARCHAR(128) NOT NULL,
  country       VARCHAR(64),
  currency      VARCHAR(8) NOT NULL DEFAULT 'USD'
) ENGINE=InnoDB;

-- Section 4: stock code -> stock name lookup table (3b + stock metadata)
CREATE TABLE IF NOT EXISTS stock (
  exchange_code VARCHAR(16) NOT NULL,
  stock_code    VARCHAR(32) NOT NULL,
  stock_name    VARCHAR(255) NOT NULL,
  sector        VARCHAR(128),
  listed_date   DATE,                      -- used for the <5yo company-age exclusion
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (exchange_code, stock_code),
  CONSTRAINT fk_stock_exchange FOREIGN KEY (exchange_code)
    REFERENCES exchange (exchange_code) ON DELETE CASCADE,
  INDEX idx_stock_name (stock_name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Time-series / financial data (requirement doc section 3)
-- ---------------------------------------------------------------------

-- 3c + 3d: Date, Daily Price OHLC
CREATE TABLE IF NOT EXISTS daily_price (
  exchange_code VARCHAR(16) NOT NULL,
  stock_code    VARCHAR(32) NOT NULL,
  price_date    DATE NOT NULL,
  open          DECIMAL(18,4) NOT NULL,
  high          DECIMAL(18,4) NOT NULL,
  low           DECIMAL(18,4) NOT NULL,
  close         DECIMAL(18,4) NOT NULL,
  volume        BIGINT,
  PRIMARY KEY (exchange_code, stock_code, price_date),
  CONSTRAINT fk_price_stock FOREIGN KEY (exchange_code, stock_code)
    REFERENCES stock (exchange_code, stock_code) ON DELETE CASCADE,
  INDEX idx_price_date (price_date)
) ENGINE=InnoDB;

-- 3e: Market Cap (kept as a history table so "latest" is just the max as_of_date)
CREATE TABLE IF NOT EXISTS market_cap (
  exchange_code VARCHAR(16) NOT NULL,
  stock_code    VARCHAR(32) NOT NULL,
  as_of_date    DATE NOT NULL,
  market_cap    DECIMAL(24,2) NOT NULL,
  PRIMARY KEY (exchange_code, stock_code, as_of_date),
  CONSTRAINT fk_mcap_stock FOREIGN KEY (exchange_code, stock_code)
    REFERENCES stock (exchange_code, stock_code) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3f: Dividend declared per year, in cents
CREATE TABLE IF NOT EXISTS dividend (
  exchange_code   VARCHAR(16) NOT NULL,
  stock_code      VARCHAR(32) NOT NULL,
  year            SMALLINT NOT NULL,
  dividend_cents  DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (exchange_code, stock_code, year),
  CONSTRAINT fk_div_stock FOREIGN KEY (exchange_code, stock_code)
    REFERENCES stock (exchange_code, stock_code) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3g-3j: Revenue, Profit Before Tax, Profit After Tax, EBITA per year
CREATE TABLE IF NOT EXISTS financials (
  exchange_code     VARCHAR(16) NOT NULL,
  stock_code        VARCHAR(32) NOT NULL,
  year              SMALLINT NOT NULL,
  revenue           DECIMAL(24,2),
  profit_before_tax DECIMAL(24,2),
  profit_after_tax  DECIMAL(24,2),
  ebita             DECIMAL(24,2),
  PRIMARY KEY (exchange_code, stock_code, year),
  CONSTRAINT fk_fin_stock FOREIGN KEY (exchange_code, stock_code)
    REFERENCES stock (exchange_code, stock_code) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Auth & saved criteria (Person 1)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id            CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(128) NOT NULL,
  -- Profile picture (Person 1), stored inline as a resized/compressed data
  -- URL so there's no separate file store. NULL = no photo set, UI falls
  -- back to initials. Size is capped in the API + by the client resize; see
  -- migration 009 and auth.controller.js updateProfileSchema.
  avatar        LONGTEXT NULL DEFAULT NULL,
  -- Subscription/paywall (Person 2): new accounts start inactive and must
  -- subscribe (monthly, recurring) before accessing anything past login.
  -- `is_active` mirrors whether the Stripe subscription is currently
  -- active/trialing (kept in sync by webhooks - see
  -- server/src/services/subscription.service.js) and is what the paywall
  -- middleware actually checks; the stripe_* / subscription_status columns
  -- carry the detail needed to manage/display/renew it.
  is_active     TINYINT(1) NOT NULL DEFAULT 0,
  activated_at  TIMESTAMP NULL DEFAULT NULL,
  stripe_customer_id     VARCHAR(255) NULL,
  stripe_subscription_id VARCHAR(255) NULL,
  -- Mirrors Stripe's Subscription.status verbatim (active, trialing,
  -- past_due, canceled, unpaid, incomplete, ...) - NULL until the user's
  -- first checkout session completes.
  subscription_status    VARCHAR(32) NULL DEFAULT NULL,
  current_period_end     TIMESTAMP NULL DEFAULT NULL,
  -- Mirrors Stripe's Subscription.cancel_at_period_end: 1 once the user (or
  -- an admin) schedules a cancellation that hasn't taken effect yet, so the
  -- account stays active (is_active = 1) through the already-paid period and
  -- the UI can show "cancels on <current_period_end>". Reset to 0 if they
  -- resume before it lapses. Kept in sync alongside subscription_status by
  -- syncSubscriptionFromStripeObject() - see subscription.service.js.
  cancel_at_period_end   TINYINT(1) NOT NULL DEFAULT 0,
  -- Admin dashboard (Person 2): flags an account as an administrator, able
  -- to view all users and revoke/restore access. Nobody can self-serve
  -- this - see server/src/db/migrations/002_add_admin_flag.sql to bootstrap
  -- the first admin account manually.
  is_admin      TINYINT(1) NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Owner: Person 2 (Charles) - Subscription/Paywall.
-- One row per successful charge - the first subscription invoice and every
-- renewal after it (see handleInvoicePaid() in subscription.service.js).
-- `stripe_invoice_id` is nullable-unique so each Stripe invoice is only
-- ever recorded once, even if Stripe redelivers the webhook.
-- `user_id` is nullable with ON DELETE SET NULL (not CASCADE) so deleting a
-- user account *detaches* their payment rows rather than erasing them -
-- collected revenue stays on the books (admin revenue stats sum this table
-- directly), just anonymized. See deleteAccount()/deleteUser() and
-- migration 007.
CREATE TABLE IF NOT EXISTS payment (
  id               CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id          CHAR(36) NULL,
  amount_cents     INT NOT NULL,
  currency         VARCHAR(8) NOT NULL DEFAULT 'USD',
  status           ENUM('succeeded', 'failed') NOT NULL DEFAULT 'succeeded',
  payment_method   VARCHAR(32) NOT NULL DEFAULT 'mock',
  stripe_invoice_id VARCHAR(255) NULL UNIQUE,
  paid_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Owner: Person 2 (Charles) - added for login 2FA on top of Person 1's auth
-- flow. One row per emailed one-time code (see server/src/services/
-- auth.service.js). Codes are stored hashed (bcrypt), never in plaintext -
-- same pattern as users.password_hash.
CREATE TABLE IF NOT EXISTS login_otp (
  id           CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id      CHAR(36) NOT NULL,
  code_hash    VARCHAR(255) NOT NULL,
  expires_at   TIMESTAMP NOT NULL,
  consumed_at  TIMESTAMP NULL DEFAULT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_login_otp_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Owner: Person 1 - added for verifying a changed login email. Same shape as
-- login_otp, plus `new_email`: the code is emailed to the pending address to
-- prove the user controls it, and that address only lands on the users row
-- once the matching code is confirmed (see auth.service.js). Codes are
-- stored hashed (bcrypt), never in plaintext.
CREATE TABLE IF NOT EXISTS email_change_otp (
  id           CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id      CHAR(36) NOT NULL,
  new_email    VARCHAR(255) NOT NULL,
  code_hash    VARCHAR(255) NOT NULL,
  expires_at   TIMESTAMP NOT NULL,
  consumed_at  TIMESTAMP NULL DEFAULT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_email_change_otp_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS saved_criteria_set (
  id         CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id    CHAR(36) NOT NULL,
  name       VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_criteria_set_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS saved_criteria_item (
  id                CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  criteria_set_id   CHAR(36) NOT NULL,
  criteria_key      VARCHAR(64) NOT NULL,  -- matches CriteriaKey in shared/types
  min_value         DECIMAL(24,4),
  max_value         DECIMAL(24,4),
  weight_value      DECIMAL(4,2),  -- ranking weight (Screener.jsx) - a criterion can be weight-only, with no min/max
  CONSTRAINT fk_criteria_item_set FOREIGN KEY (criteria_set_id)
    REFERENCES saved_criteria_set (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Watchlist / notifications (Person 5)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS watchlist (
  id                   CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id              CHAR(36) NOT NULL,
  exchange_code        VARCHAR(16) NOT NULL,
  stock_code           VARCHAR(32) NOT NULL,
  saved_criteria_set_id CHAR(36),
  channel              ENUM('whatsapp', 'telegram', 'email') NOT NULL DEFAULT 'email',
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_watchlist_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_watchlist_stock FOREIGN KEY (exchange_code, stock_code)
    REFERENCES stock (exchange_code, stock_code) ON DELETE CASCADE,
  CONSTRAINT fk_watchlist_criteria_set FOREIGN KEY (saved_criteria_set_id)
    REFERENCES saved_criteria_set (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS watchlist_alert_log (
  id            CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  watchlist_id  CHAR(36) NOT NULL,
  triggered_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  message       TEXT,
  CONSTRAINT fk_alert_watchlist FOREIGN KEY (watchlist_id)
    REFERENCES watchlist (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Single-row config for the admin dashboard's "auto-reseed" toggle (see
-- server/src/services/ingestion.service.js) - lets the ingestion pipeline
-- (ingestion/ingest.py) re-run on a fixed interval instead of only ever
-- being triggered manually. next_run_at_ms/interval stored as plain
-- milliseconds (not TIMESTAMP) so the scheduler's Date.now() comparisons
-- in Node don't have to round-trip through MySQL's session timezone.
CREATE TABLE IF NOT EXISTS reseed_schedule (
  id             TINYINT PRIMARY KEY DEFAULT 1,
  interval_hours INT NULL,      -- NULL = auto-reseed disabled
  next_run_at_ms BIGINT NULL,   -- epoch ms of the next scheduled run; NULL when disabled
  -- epoch ms of the last successful reseed (manual or scheduled), so the
  -- admin panel can show when the data was last refreshed. NULL until the
  -- first successful run. See ingestion.service.js.
  last_reseed_at_ms BIGINT NULL DEFAULT NULL,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- AI Analysis Recommendation History (Person 1)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_analysis (
  id            CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id       CHAR(36) NOT NULL,
  -- The shortlisted stocks sent to the model, kept so the history page can
  -- show what was analyzed without re-joining against live screener data.
  stocks        JSON NOT NULL,
  analysis_text MEDIUMTEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_analysis_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  INDEX idx_ai_analysis_user_created (user_id, created_at)
) ENGINE=InnoDB;