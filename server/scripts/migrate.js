import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mysql from "mysql2/promise";
import "dotenv/config";

/**
 * Applies server/src/db/schema.sql, then every file in
 * server/src/db/migrations/ (in filename order), against the configured
 * MySQL instance. The migration files are written to be idempotent (they
 * check information_schema before altering, or use CREATE TABLE IF NOT
 * EXISTS), so running this repeatedly - e.g. every time a Docker container
 * starts - is safe and just becomes a no-op once everything is applied.
 *
 * Usage: npm run db:migrate --workspace=server
 */
async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(__dirname, "../src/db/schema.sql");
  const migrationsDir = path.resolve(__dirname, "../src/db/migrations");

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "stockpicker",
    password: process.env.DB_PASSWORD ?? "",
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
