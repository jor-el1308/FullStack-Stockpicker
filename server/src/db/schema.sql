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
  -- Subscription/paywall (Person 2): new accounts start inactive and must
  -- pay a one-time activation fee before accessing anything past login.
  -- See `payment` table below and server/src/services/subscription.service.js.
  is_active     TINYINT(1) NOT NULL DEFAULT 0,
  activated_at  TIMESTAMP NULL DEFAULT NULL,
  -- Admin dashboard (Person 2): flags an account as an administrator, able
  -- to view all users and revoke/restore access. Nobody can self-serve
  -- this - see server/src/db/migrations/002_add_admin_flag.sql to bootstrap
  -- the first admin account manually.
  is_admin      TINYINT(1) NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Owner: Person 2 (Charles) - Subscription/Paywall.
-- One row per (mock) payment attempt. This is a MOCK payment record, not a
-- real processor integration - see subscription.service.js for details.
CREATE TABLE IF NOT EXISTS payment (
  id             CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id        CHAR(36) NOT NULL,
  amount_cents   INT NOT NULL,
  currency       VARCHAR(8) NOT NULL DEFAULT 'USD',
  status         ENUM('succeeded', 'failed') NOT NULL DEFAULT 'succeeded',
  payment_method VARCHAR(32) NOT NULL DEFAULT 'mock',
  paid_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
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
