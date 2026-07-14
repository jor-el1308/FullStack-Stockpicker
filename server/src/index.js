import "dotenv/config";
import { createApp } from "./app.js";
import { pingDb } from "./config/db.js";
import { getJwtSecret } from "./config/jwt.js";

const PORT = Number(process.env.PORT ?? 4000);

async function main() {
  getJwtSecret(); // fail fast rather than silently signing tokens with a guessable default

  const app = createApp();

  const dbOk = await pingDb();
  if (!dbOk) {
    console.warn(
      "[startup] Could not reach MySQL. Server will still start so frontend/API work can continue, " +
        "but data endpoints will fail until DB_* env vars in server/.env are correct and the schema is migrated."
    );
  }

  app.listen(PORT, () => {
    console.log(`[server] Stock Screener API listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("[startup] Fatal error:", err);
  process.exit(1);
});
