import mysql from "mysql2/promise";
import "dotenv/config";

/**
 * Blocks until MySQL accepts connections, or gives up after a timeout.
 * Used by Docker so the server container doesn't try to migrate/start
 * against a MySQL container that's still initializing.
 *
 * Usage: node scripts/wait-for-db.js
 */
const MAX_ATTEMPTS = Number(process.env.DB_WAIT_ATTEMPTS ?? 30);
const DELAY_MS = Number(process.env.DB_WAIT_DELAY_MS ?? 2000);

async function tryConnect() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "stockpicker",
    password: process.env.DB_PASSWORD ?? "",
  });
  await connection.ping();
  await connection.end();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await tryConnect();
      console.log(`[wait-for-db] MySQL is ready (attempt ${attempt}).`);
      return;
    } catch (err) {
      console.log(
        `[wait-for-db] MySQL not ready yet (attempt ${attempt}/${MAX_ATTEMPTS}): ${err.message}`
      );
      if (attempt === MAX_ATTEMPTS) {
        console.error("[wait-for-db] Giving up.");
        process.exit(1);
      }
      await sleep(DELAY_MS);
    }
  }
}

main();
