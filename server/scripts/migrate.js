import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mysql from "mysql2/promise";
import "dotenv/config";

/**
 * Applies server/src/db/schema.sql against the configured MySQL instance.
 * Usage: npm run db:migrate --workspace=server
 */
async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(__dirname, "../src/db/schema.sql");
  const sql = readFileSync(schemaPath, "utf-8");

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "stockpicker",
    password: process.env.DB_PASSWORD ?? "",
    multipleStatements: true,
  });

  console.log("[migrate] Applying schema.sql ...");
  await connection.query(sql);
  console.log("[migrate] Done.");
  await connection.end();
}

main().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
