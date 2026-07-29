-- Owner: Person 2 (Charles) - Admin Dashboard.
--
-- Adds the single-row reseed_schedule table backing the admin dashboard's
-- "auto-reseed every N hours/days" toggle (see server/src/services/
-- ingestion.service.js). CREATE TABLE IF NOT EXISTS is already idempotent -
-- no information_schema guard needed like the ALTER-based migrations in
-- this directory. Safe to run even on a fresh database - schema.sql
-- already has this table, so this is a no-op there.
--
--   mysql -u <user> -p <your DB_NAME> < server/src/db/migrations/006_add_reseed_schedule.sql

CREATE TABLE IF NOT EXISTS reseed_schedule (
  id             TINYINT PRIMARY KEY DEFAULT 1,
  interval_hours INT NULL,
  next_run_at_ms BIGINT NULL,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
