-- Owner: Person 2 (Charles) - Admin Dashboard.
--
-- Records when the stock data was last successfully reseeded, so the admin
-- panel can show "Last reseeded: <time>". Lives on the single-row
-- reseed_schedule config table (id = 1) alongside the auto-reseed interval,
-- and is persisted (not just in the in-memory ingestion state) so it
-- survives a server restart. Stored as epoch milliseconds, matching
-- next_run_at_ms, to avoid MySQL session-timezone round-trips.
--
-- schema.sql uses CREATE TABLE IF NOT EXISTS for reseed_schedule, so this
-- ALTER is how existing databases pick up the new column. Guarded with an
-- information_schema check so re-running it is a safe no-op.
--   mysql -u <user> -p <your DB_NAME> < server/src/db/migrations/010_add_last_reseed_at.sql

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reseed_schedule' AND COLUMN_NAME = 'last_reseed_at_ms'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE reseed_schedule ADD COLUMN last_reseed_at_ms BIGINT NULL DEFAULT NULL AFTER next_run_at_ms',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
