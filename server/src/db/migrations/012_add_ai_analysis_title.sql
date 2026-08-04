-- Owner: Person 1 (Yong Wee) - AI Analysis Recommendation History.
--
-- Adds a renameable title to each saved AI analysis run, shown on the
-- AiHistory page. schema.sql uses CREATE TABLE IF NOT EXISTS for
-- `ai_analysis`, so this ALTER is how a database that already ran migration
-- 011 picks up the new column. Guarded with an information_schema check so
-- re-running it is a safe no-op.
--   mysql -u <user> -p <your DB_NAME> < server/src/db/migrations/012_add_ai_analysis_title.sql

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_analysis' AND COLUMN_NAME = 'title'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE ai_analysis ADD COLUMN title VARCHAR(200) NOT NULL DEFAULT '''' AFTER user_id',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill any rows saved before this column existed with a generated title
-- (mirrors the default in aiHistory.service.js's defaultTitleFor()) instead
-- of leaving them blank.
UPDATE ai_analysis
SET title = CONCAT('AI Analysis - ', DATE_FORMAT(created_at, '%Y-%m-%d %H:%i'))
WHERE title = '';
