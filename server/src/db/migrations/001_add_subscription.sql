-- Owner: Person 2 (Charles) - Subscription/Paywall.
--
-- schema.sql uses `CREATE TABLE IF NOT EXISTS`, so if you already ran
-- db:migrate before this feature existed, your `users` table won't
-- automatically get the new columns - run this file once against your
-- existing database to catch up:
--
--   mysql -u stockpicker -p stockpicker < server/src/db/migrations/001_add_subscription.sql
--
-- Safe to run even if you migrated fresh (schema.sql already has these) -
-- the guards below make it a no-op in that case.

USE stockpicker;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'stockpicker' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_active'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 0 AFTER name',
  'SELECT "is_active already exists, skipping"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'stockpicker' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'activated_at'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN activated_at TIMESTAMP NULL DEFAULT NULL AFTER is_active',
  'SELECT "activated_at already exists, skipping"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

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
