-- Owner: Person 1 (Yong Wee) - Auth & User Management.
--
-- Adds "Sign in with Microsoft" support:
--   users.microsoft_id - the stable Microsoft account id ("oid" claim) for
--   accounts that have linked Microsoft sign-in, nullable+unique so a
--   password-only (or Google-only) account has NULL here and a Microsoft id
--   can never be claimed by two rows. See auth.service.js's
--   findOrCreateMicrosoftUser(). password_hash is already nullable as of
--   migration 014, so nothing further is needed there.
--
-- Run once against an existing database:
--   mysql -u <user> -p <your DB_NAME> < server/src/db/migrations/015_add_microsoft_oauth.sql
--
-- Safe to run repeatedly and on a fresh database - schema.sql already has
-- this, so the guard below makes it a no-op in that case.

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'microsoft_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN microsoft_id VARCHAR(255) NULL UNIQUE AFTER google_id',
  'SELECT ''users.microsoft_id already exists, skipping'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
