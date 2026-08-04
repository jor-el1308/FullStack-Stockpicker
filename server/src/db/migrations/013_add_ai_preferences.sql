-- Owner: Person 1 (Yong Wee) - AI Preferences.
--
-- Adds a one-row-per-user table storing AI model/persona/output preferences
-- for the AI analysis feature (Settings -> AI preferences). schema.sql uses
-- CREATE TABLE IF NOT EXISTS for `ai_preferences`, so this migration is how a
-- database that ran migrations up to 012 picks up the new table.
--   mysql -u <user> -p <your DB_NAME> < server/src/db/migrations/013_add_ai_preferences.sql

CREATE TABLE IF NOT EXISTS ai_preferences (
  user_id             CHAR(36) PRIMARY KEY,
  ai_model_tier       VARCHAR(32) NOT NULL DEFAULT 'flash',
  ai_persona          VARCHAR(32) NOT NULL DEFAULT 'balanced',
  ai_detail_level     VARCHAR(16) NOT NULL DEFAULT 'concise',
  custom_instructions VARCHAR(1000) NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_preferences_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;
