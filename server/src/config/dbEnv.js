import { readFileSync } from "node:fs";

/**
 * Owner: Person 2 (Charles) - Data Collection & Database Design.
 *
 * Shared MySQL connection options derived from env vars, used by both the
 * connection pool (db.js) and the one-off scripts (migrate.js, seed.js,
 * wait-for-db.js) so they all connect the same way regardless of whether
 * MySQL is the local Docker container or an external host - e.g. a shared
 * team database on a free managed provider like Aiven
 * (https://aiven.io/free-mysql-database).
 *
 * Most external managed MySQL hosts require TLS. Set DB_SSL=true to enable
 * it. DB_SSL_CA can point at a downloaded CA certificate file for proper
 * verification (e.g. Aiven gives you one to download from its console);
 * without it, the connection still uses TLS but doesn't verify the
 * server's certificate - fine for a class project, not for anything where
 * that actually matters.
 */
export function getDbConnectionOptions() {
  const options = {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "stockpicker",
    password: process.env.DB_PASSWORD ?? "",
  };

  if (process.env.DB_SSL === "true") {
    options.ssl = process.env.DB_SSL_CA
      ? { ca: readFileSync(process.env.DB_SSL_CA, "utf-8") }
      : { rejectUnauthorized: false };
  }

  return options;
}
