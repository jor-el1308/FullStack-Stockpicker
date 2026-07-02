-- Stock Screener Application - MySQL schema
-- Owner: Person 2 (Charles) - Data Collection & Database Design
--
-- Covers requirement doc section 3 (data points a-j), section 4 (stock
-- lookup table), and the auth/watchlist tables needed by Persons 1 and 5.
--
-- Run with:  npm run db:migrate --workspace=server
-- (or manually: mysql -u <user> -p stockpicker < server/src/db/schema.sql)

CREATE DATABASE IF NOT EXISTS stockpicker
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE stockpicker;

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
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
