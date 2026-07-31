-- Owner: Person 1 (Yong Wee) - Auth & User Management.
--
-- Profile picture support. The image is stored inline as a data URL
-- (data:image/...;base64,...), resized/compressed on the client to a small
-- square before upload, so there's no separate file store or static-asset
-- serving to run - the avatar travels with the user record. LONGTEXT (not
-- TEXT) leaves generous headroom; the real size cap is enforced in the API
-- (see auth.controller.js updateProfileSchema) and by the client resize.
--
-- schema.sql uses CREATE TABLE IF NOT EXISTS for `users`, so this ALTER is
-- how existing databases pick up the new column. Guarded with an
-- information_schema check so re-running it is a safe no-op.
--   mysql -u <user> -p <your DB_NAME> < server/src/db/migrations/009_add_user_avatar.sql

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'avatar'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE users ADD COLUMN avatar LONGTEXT NULL DEFAULT NULL AFTER name',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
