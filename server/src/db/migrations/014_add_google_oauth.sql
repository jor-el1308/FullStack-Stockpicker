-- Owner: Person 1 (Yong Wee) - Auth & User Management.
--
-- Adds "Sign in with Google" support:
--   1. users.google_id - the stable Google account id ("sub" claim) for
--      accounts that have linked Google sign-in, nullable+unique so a
--      password-only account has NULL here and a Google id can never be
--      claimed by two rows. See auth.service.js's findOrCreateGoogleUser().
--   2. users.password_hash - relaxed to nullable. An account created via
--      Google sign-in never sets a password, so it has nothing to hash;
--      such a user simply can't use the POST /auth/login (password) path
--      until they set one via a future "add a password" flow.
--
-- Run once against an existing database:
--   mysql -u <user> -p <your DB_NAME> < server/src/db/migrations/014_add_google_oauth.sql
--
-- Safe to run repeatedly and on a fresh database - schema.sql already has
-- these, so the guards below make it a no-op in that case.

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'google_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN google_id VARCHAR(255) NULL UNIQUE AFTER password_hash',
  'SELECT ''users.google_id already exists, skipping'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @is_nullable = (
  SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_hash'
);
SET @sql = IF(@is_nullable = 'NO',
  'ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL',
  'SELECT ''users.password_hash already nullable, skipping'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
