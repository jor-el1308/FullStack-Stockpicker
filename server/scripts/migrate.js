import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mysql from "mysql2/promise";
import "dotenv/config";
import { getDbConnectionOptions } from "../src/config/dbEnv.js";

/**
 * Applies server/src/db/schema.sql, then every file in
 * server/src/db/migrations/ (in filename order), against the configured
 * MySQL instance. The migration files are written to be idempotent (they
 * check information_schema before altering, or use CREATE TABLE IF NOT
 * EXISTS), so running this repeatedly - e.g. every time a Docker container
 * starts - is safe and just becomes a no-op once everything is applied.
 *
 * None of the .sql files hardcode a database name (they used to have a
 * literal USE statement, which broke on managed hosts like Aiven where the
 * database is provisioned under a different fixed name, e.g. `defaultdb`).
 * Instead: first try to CREATE DATABASE IF NOT EXISTS <DB_NAME> (works for
 * a local/Docker MySQL you have full control over; best-effort and safe to
 * fail on a managed host where the database already exists but you don't
 * have permission to create new ones), then open the real connection with
 * that database selected via the connection options themselves.
 *
 * Usage: npm run db:migrate --workspace=server
 */
async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(__dirname, "../src/db/schema.sql");
  const migrationsDir = path.resolve(__dirname, "../src/db/migrations");
  const dbName = process.env.DB_NAME ?? "stockpicker";

  try {
    const bootstrapConnection = await mysql.createConnection(getDbConnectionOptions());
    await bootstrapConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await bootstrapConnection.end();
    console.log(`[migrate] Database \`${dbName}\` ready.`);
  } catch (err) {
    console.log(
      `[migrate] Skipping CREATE DATABASE (${err.message}) - normal on a managed host where the database already exists.`
    );
  }

  const connection = await mysql.createConnection({
    ...getDbConnectionOptions(),
    database: dbName,
    multipleStatements: true,
  });

  console.log("[migrate] Applying schema.sql ...");
  await connection.query(readFileSync(schemaPath, "utf-8"));

  const migrationFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    console.log(`[migrate] Applying migrations/${file} ...`);
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    await connection.query(sql);
  }

  console.log("[migrate] Done.");
  await connection.end();
}

main().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
