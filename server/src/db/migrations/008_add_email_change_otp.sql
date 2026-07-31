-- Owner: Person 1 (Yong Wee) - Auth & User Management.
--
-- Verifying a new email address before it replaces the account's login
-- email. Mirrors the login_otp table (migration 003): one row per emailed
-- code, stored hashed (bcrypt), never in plaintext. The difference is the
-- extra `new_email` column - the code is sent to the *pending* address to
-- prove the user actually controls it, and that address is only written onto
-- the users row once the matching code comes back.
--
-- schema.sql uses CREATE TABLE IF NOT EXISTS, so this is only needed if you
-- ran db:migrate before this feature existed. Run once:
--   mysql -u <user> -p <your DB_NAME> < server/src/db/migrations/008_add_email_change_otp.sql
--
-- Safe to run even on a fresh database - it's a no-op in that case.

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
