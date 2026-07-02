import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mysql from "mysql2/promise";
import "dotenv/config";

/**
 * Loads server/src/db/seed.sql sample data. Usage: npm run db:seed --workspace=server
 */
async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const seedPath = path.resolve(__dirname, "../src/db/seed.sql");
  const sql = readFileSync(seedPath, "utf-8");

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "stockpicker",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "stockpicker",
    multipleStatements: true,
  });

  console.log("[seed] Loading seed.sql ...");
  await connection.query(sql);
  console.log("[seed] Done.");
  await connection.end();
}

main().catch((err) => {
  console.error("[seed] Failed:", err);
  process.exit(1);
});
