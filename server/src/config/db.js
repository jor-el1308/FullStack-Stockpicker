import mysql from "mysql2/promise";
import "dotenv/config";

/**
 * MySQL connection pool.
 * Owned by Person 2 (Charles) - Data Collection & Database Design.
 *
 * All queries elsewhere in the app should go through this pool rather than
 * opening their own connections, so pooling/limits stay centralized.
 */
export const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "stockpicker",
  password: process.env.DB_PASSWORD ?? "",
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
