-- Owner: Person 1 (Auth & User Management) - bugfix for saved screens
-- silently dropping a criterion's ranking weight.
--
-- schema.sql already has this column via CREATE TABLE IF NOT EXISTS, so this
-- is only needed if you ran db:migrate before this fix existed. Run once:
--   mysql -u <user> -p <your DB_NAME> < server/src/db/migrations/004_add_criteria_weight.sql
--
-- Before this, a screener criterion set with only a `weight` (no min/max -
-- used to influence ranking, not to filter rows) was silently dropped when
-- saving a screen, because saved_criteria_item had nowhere to store it.

SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'saved_criteria_item'
    AND COLUMN_NAME = 'weight_value'
);

SET @ddl = IF(
  @column_exists = 0,
  'ALTER TABLE saved_criteria_item ADD COLUMN weight_value DECIMAL(4,2) AFTER max_value',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
