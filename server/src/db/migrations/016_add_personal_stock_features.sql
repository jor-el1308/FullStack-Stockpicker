-- Migration 014 (Person 4 — Enrico): personal, user-owned features for the
-- Dashboard and Stock Report pages. All three are per-user data the user can
-- create/read/update/delete from the website:
--   * stock_note    — private notes a user writes about a stock (full CRUD)
--   * starred_stock — stocks pinned to the dashboard, independent of filters
--   * price_target  — a personal target price shown on the stock report
--
-- All reference users(id) ON DELETE CASCADE so a deleted account cleans up.
-- Idempotent (IF NOT EXISTS) so re-running db:migrate is safe.

CREATE TABLE IF NOT EXISTS stock_note (
  id            CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id       CHAR(36)    NOT NULL,
  exchange_code VARCHAR(16) NOT NULL,
  stock_code    VARCHAR(32) NOT NULL,
  body          TEXT        NOT NULL,
  created_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_note_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  INDEX idx_stock_note_user_stock (user_id, exchange_code, stock_code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS starred_stock (
  id            CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id       CHAR(36)    NOT NULL,
  exchange_code VARCHAR(16) NOT NULL,
  stock_code    VARCHAR(32) NOT NULL,
  created_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_starred_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  -- one star per user per stock; makes star/unstar idempotent
  UNIQUE KEY uq_starred (user_id, exchange_code, stock_code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS price_target (
  id            CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id       CHAR(36)      NOT NULL,
  exchange_code VARCHAR(16)   NOT NULL,
  stock_code    VARCHAR(32)   NOT NULL,
  target_price  DECIMAL(18,4) NOT NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_price_target_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  -- one target per user per stock (set/update is an upsert)
  UNIQUE KEY uq_price_target (user_id, exchange_code, stock_code)
) ENGINE=InnoDB;