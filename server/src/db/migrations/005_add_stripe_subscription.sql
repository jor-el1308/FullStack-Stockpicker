-- Owner: Person 2 (Charles) - Subscription/Paywall.
--
-- Switches billing from a one-time activation fee to a monthly recurring
-- Stripe subscription. Adds the columns needed to track a user's Stripe
-- customer/subscription and to dedupe recorded invoice payments. Run once
-- against an existing database:
--
--   mysql -u <user> -p <your DB_NAME> < server/src/db/migrations/005_add_stripe_subscription.sql
--
-- Safe to run even on a fresh database - schema.sql already has these
-- columns, so the guards below make this a no-op in that case. Uses
-- DATABASE() rather than a hardcoded name, same reasoning as the other
-- migration files in this directory.

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'stripe_customer_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255) NULL AFTER is_admin',
  'SELECT ''stripe_customer_id already exists, skipping'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'stripe_subscription_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN stripe_subscription_id VARCHAR(255) NULL AFTER stripe_customer_id',
  'SELECT ''stripe_subscription_id already exists, skipping'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'subscription_status'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN subscription_status VARCHAR(32) NULL DEFAULT NULL AFTER stripe_subscription_id',
  'SELECT ''subscription_status already exists, skipping'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'current_period_end'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN current_period_end TIMESTAMP NULL DEFAULT NULL AFTER subscription_status',
  'SELECT ''current_period_end already exists, skipping'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment' AND COLUMN_NAME = 'stripe_invoice_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE payment ADD COLUMN stripe_invoice_id VARCHAR(255) NULL UNIQUE AFTER payment_method',
  'SELECT ''stripe_invoice_id already exists, skipping'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
