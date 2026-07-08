-- Owner: Person 2 (Charles) - added for login 2FA on top of Person 1's auth
-- flow.
--
-- schema.sql uses CREATE TABLE IF NOT EXISTS, so this is only needed if you
-- ran db:migrate before this feature existed. Run once:
--   mysql -u <user> -p <your DB_NAME> < server/src/db/migrations/003_add_login_otp.sql
--
-- Safe to run even on a fresh database - it's a no-op in that case. No
-- hardcoded database name here - migrate.js connects with DB_NAME already
-- selected, which matters for managed hosts like Aiven.

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
