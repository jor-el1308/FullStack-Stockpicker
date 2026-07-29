-- Owner: Person 2 (Charles) - Subscription/Paywall + Admin Dashboard.
--
-- Adds account deletion support (self-service and admin hard-delete) plus a
-- native "cancel at period end" flag:
--
--   1. payment.user_id -> nullable with FK ON DELETE SET NULL (was NOT NULL
--      + ON DELETE CASCADE). Deleting a user now *detaches* their payments
--      instead of erasing them, so collected revenue stays on the books
--      (admin revenue stats sum the payment table directly), just anonymized.
--   2. users.cancel_at_period_end - mirrors Stripe's
--      Subscription.cancel_at_period_end so a user (or admin) can schedule a
--      cancellation that keeps access through the already-paid period.
--
-- Run once against an existing database:
--
--   mysql -u <user> -p <your DB_NAME> < server/src/db/migrations/007_add_account_deletion.sql
--
-- Safe to run repeatedly and on a fresh database - schema.sql already has
-- these, so the guards below make it a no-op in that case. Uses DATABASE()
-- rather than a hardcoded name, same reasoning as the other migrations here.

-- 1a. Drop the existing FK on payment.user_id (whatever its delete rule) so
--     we can change the column nullability and re-add it with SET NULL.
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'payment'
    AND CONSTRAINT_NAME = 'fk_payment_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql = IF(@fk_exists > 0,
  'ALTER TABLE payment DROP FOREIGN KEY fk_payment_user',
  'SELECT ''fk_payment_user not present, skipping drop'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 1b. Make user_id nullable (required for ON DELETE SET NULL).
SET @is_nullable = (
  SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment' AND COLUMN_NAME = 'user_id'
);
SET @sql = IF(@is_nullable = 'NO',
  'ALTER TABLE payment MODIFY COLUMN user_id CHAR(36) NULL',
  'SELECT ''payment.user_id already nullable, skipping'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 1c. Re-add the FK with ON DELETE SET NULL.
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'payment'
    AND CONSTRAINT_NAME = 'fk_payment_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE payment ADD CONSTRAINT fk_payment_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL',
  'SELECT ''fk_payment_user already present, skipping add'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. users.cancel_at_period_end
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'cancel_at_period_end'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0 AFTER current_period_end',
  'SELECT ''cancel_at_period_end already exists, skipping'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
