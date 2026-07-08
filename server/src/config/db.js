import mysql from "mysql2/promise";
import "dotenv/config";
import { getDbConnectionOptions } from "./dbEnv.js";

/**
 * MySQL connection pool.
 * Owned by Person 2 (Charles) - Data Collection & Database Design.
 *
 * All queries elsewhere in the app should go through this pool rather than
 * opening their own connections, so pooling/limits stay centralized.
 *
 * Connection host/port/user/password/TLS come from getDbConnectionOptions()
 * (server/src/config/dbEnv.js) - same options the migrate/seed/wait-for-db
 * scripts use, so pointing everything at an external shared database (e.g.
 * Aiven's free MySQL tier) just means setting DB_HOST/DB_SSL/etc in .env,
 * no code changes needed.
 */
export const pool = mysql.createPool({
  ...getDbConnectionOptions(),
  database: process.env.DB_NAME ?? "stockpicker",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
});

/**
 * @returns {Promise<boolean>}
 */
export async function pingDb() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    return true;
  } catch (err) {
    console.error("[db] connection failed:", err.message);
    return false;
  }
}
