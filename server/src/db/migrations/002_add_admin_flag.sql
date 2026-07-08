-- Owner: Person 2 (Charles) - Admin Dashboard.
--
-- Adds `is_admin` to `users` for databases that already existed before this
-- feature. Run once:
--   mysql -u <user> -p <your DB_NAME> < server/src/db/migrations/002_add_admin_flag.sql
-- (or paste into a MySQL Workbench SQL tab if `mysql` isn't on your PATH)
--
-- Safe to run even on a fresh database - schema.sql already has this column,
-- so the guard below makes this a no-op in that case. Uses DATABASE()
-- rather than a hardcoded name since migrate.js connects with DB_NAME
-- selected dynamically - matters for managed hosts like Aiven.

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_admin'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER activated_at',
  'SELECT ''is_admin already exists, skipping'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Bootstrap: nobody can make themselves admin through the app (no self-serve
-- endpoint, on purpose). To make your own account the first admin, sign up
-- normally through the app first, then run this once with your own email:
--
--   UPDATE users SET is_admin = 1 WHERE email = 'you@example.com';
--
-- After that, that account can promote/demote other admins from the Admin
-- dashboard's API - see server/src/routes/admin.routes.js.
