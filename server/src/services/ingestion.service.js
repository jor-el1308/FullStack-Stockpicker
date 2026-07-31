import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../config/db.js";

/**
 * Owner: Person 2 (Charles) - Admin Dashboard.
 *
 * Lets an admin re-run ingestion/ingest.py (the Yahoo Finance pipeline -
 * see its docstring) from the website instead of needing shell access,
 * so "the stock data is stale" can be fixed with a button instead of
 * someone SSHing in and running `python ingest.py` by hand.
 *
 * ingest.py is a long-running, one-at-a-time script (dozens of tickers,
 * each with a polite 0.5s delay - see its main loop), so this runs it as
 * a detached child process and tracks progress in memory rather than
 * blocking the HTTP request for however long a full run takes. State is
 * process-local (fine for a single-instance prototype deployment; would
 * need to move to a shared store like Redis if this ever runs behind
 * multiple API instances).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INGESTION_DIR = path.resolve(__dirname, "../../../ingestion");
const MAX_OUTPUT_LINES = 500;
const TAIL_LINES_FOR_STATUS = 100;

let state = {
  running: false,
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  error: null,
  output: [],
};

/**
 * ingest.py lives in a venv (see ingestion/README.md's setup steps) -
 * prefer that interpreter over a bare "python" on PATH so this picks up
 * the same yfinance/mysql-connector versions a developer set up locally.
 * Falls back to "python" on PATH if no venv is found (e.g. a deployment
 * that installed dependencies globally instead).
 */
function resolvePythonExecutable() {
  const winPython = path.join(INGESTION_DIR, "venv", "Scripts", "python.exe");
  const posixPython = path.join(INGESTION_DIR, "venv", "bin", "python");
  if (existsSync(winPython)) return winPython;
  if (existsSync(posixPython)) return posixPython;
  return "python";
}

function appendOutput(chunk) {
  const lines = chunk
    .toString()
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
  if (lines.length === 0) return;
  state.output.push(...lines);
  if (state.output.length > MAX_OUTPUT_LINES) {
    state.output = state.output.slice(-MAX_OUTPUT_LINES);
  }
}

/**
 * Kicks off ingest.py in the background. Returns immediately - poll
 * getReseedStatus() for progress/completion.
 * @param {{ trigger?: "manual" | "scheduled" }} [options]
 */
export function startReseed(options = {}) {
  if (state.running) {
    return { started: false, alreadyRunning: true };
  }

  const trigger = options.trigger ?? "manual";
  state = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    error: null,
    output: [trigger === "scheduled" ? "[scheduler] auto-reseed starting" : "[admin] reseed starting"],
  };

  const pythonExe = resolvePythonExecutable();
  // "-u": unbuffered stdout/stderr, so output shows up in status polls as
  // it's printed instead of only after the whole script exits.
  const child = spawn(pythonExe, ["-u", "ingest.py"], { cwd: INGESTION_DIR });

  child.stdout.on("data", appendOutput);
  child.stderr.on("data", appendOutput);

  child.on("error", (err) => {
    state.running = false;
    state.error = err.message;
    state.finishedAt = new Date().toISOString();
    scheduleNextRunAfterCompletion();
  });

  child.on("close", (code) => {
    state.running = false;
    state.exitCode = code;
    state.finishedAt = new Date().toISOString();
    // Only a clean exit (0) counts as an actual data refresh worth stamping
    // as the "last reseeded" time - a crashed/failed run left the data as it
    // was.
    if (code === 0) recordSuccessfulReseed();
    scheduleNextRunAfterCompletion();
  });

  return { started: true };
}

/**
 * @returns {{running: boolean, startedAt: ?string, finishedAt: ?string, exitCode: ?number, error: ?string, output: string[]}}
 * `output` is just the tail (most recent lines) - the admin UI polls this
 * repeatedly, no need to ship the full (capped) buffer every time.
 */
export function getReseedStatus() {
  return {
    running: state.running,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    exitCode: state.exitCode,
    error: state.error,
    output: state.output.slice(-TAIL_LINES_FOR_STATUS),
  };
}

/**
 * Auto-reseed scheduling: lets an admin say "reseed every N hours/days"
 * instead of remembering to click the button. Persisted in the
 * reseed_schedule table (single row, id=1 - see schema.sql) so it survives
 * a server restart; the in-memory `scheduleCache` below is just there so
 * the once-a-minute tick doesn't hit MySQL on every check.
 *
 * Stored/compared as plain epoch milliseconds rather than a SQL TIMESTAMP
 * so the Date.now() comparisons here don't have to round-trip through
 * MySQL's session timezone.
 */
const SCHEDULE_TICK_MS = 60_000;
let scheduleCache = { intervalHours: null, nextRunAtMs: null, lastReseedAtMs: null };
let schedulerStarted = false;

function msFromHours(hours) {
  return hours * 60 * 60 * 1000;
}

/**
 * Stamps "now" as the last successful reseed time, in memory and persisted
 * to reseed_schedule (row id = 1, upserted so it exists even when auto-reseed
 * was never configured). Called on every clean reseed completion, whether it
 * was triggered manually or by the scheduler.
 */
function recordSuccessfulReseed() {
  const lastReseedAtMs = Date.now();
  scheduleCache = { ...scheduleCache, lastReseedAtMs };
  pool
    .query(
      `INSERT INTO reseed_schedule (id, last_reseed_at_ms)
       VALUES (1, ?)
       ON DUPLICATE KEY UPDATE last_reseed_at_ms = VALUES(last_reseed_at_ms)`,
      [lastReseedAtMs]
    )
    .catch((err) => console.error("[ingestion] failed to persist last reseed time:", err.message));
}

/**
 * Runs after every reseed completes (success, failure, or spawn error),
 * whether it was triggered manually or by the scheduler. If a schedule is
 * active, this pushes the next run out by a full interval from *now* - so
 * a manual click in between scheduled runs effectively resets the clock.
 * Simpler than tracking "was this the scheduled run" and good enough for
 * a "just keep the data roughly fresh" feature.
 */
function scheduleNextRunAfterCompletion() {
  if (!scheduleCache.intervalHours) return;
  const nextRunAtMs = Date.now() + msFromHours(scheduleCache.intervalHours);
  scheduleCache = { ...scheduleCache, nextRunAtMs };
  pool
    .query("UPDATE reseed_schedule SET next_run_at_ms = ? WHERE id = 1", [nextRunAtMs])
    .catch((err) => console.error("[ingestion] failed to persist next scheduled reseed time:", err.message));
}

function checkSchedule() {
  if (!scheduleCache.intervalHours || !scheduleCache.nextRunAtMs) return;
  if (state.running) return; // wait for the current run (manual or scheduled) to finish
  if (Date.now() < scheduleCache.nextRunAtMs) return;
  console.log(`[ingestion] auto-reseed triggered (every ${scheduleCache.intervalHours}h)`);
  startReseed({ trigger: "scheduled" });
}

/**
 * Loads the persisted schedule and starts the once-a-minute checker. Call
 * once at server startup (see server/src/index.js). Safe to call more than
 * once - only the first call actually starts the ticker.
 *
 * Note: if the server was down when a scheduled run was due, the next tick
 * after startup fires it immediately (no "catch up" throttling) - fine for
 * a "keep the data roughly fresh" feature, not worth the extra complexity
 * of skipping missed runs.
 */
export async function initReseedScheduler() {
  try {
    const [rows] = await pool.query(
      "SELECT interval_hours AS intervalHours, next_run_at_ms AS nextRunAtMs, last_reseed_at_ms AS lastReseedAtMs FROM reseed_schedule WHERE id = 1"
    );
    const row = rows[0];
    scheduleCache = {
      intervalHours: row?.intervalHours ?? null,
      nextRunAtMs: row?.nextRunAtMs != null ? Number(row.nextRunAtMs) : null,
      lastReseedAtMs: row?.lastReseedAtMs != null ? Number(row.lastReseedAtMs) : null,
    };
  } catch (err) {
    console.error("[ingestion] failed to load reseed schedule, auto-reseed stays off until next change:", err.message);
  }

  if (!schedulerStarted) {
    schedulerStarted = true;
    setInterval(checkSchedule, SCHEDULE_TICK_MS).unref();
  }
}

/**
 * @returns {{intervalHours: ?number, nextRunAt: ?string, lastReseedAt: ?string}}
 */
export function getReseedSchedule() {
  return {
    intervalHours: scheduleCache.intervalHours,
    nextRunAt: scheduleCache.nextRunAtMs != null ? new Date(scheduleCache.nextRunAtMs).toISOString() : null,
    lastReseedAt: scheduleCache.lastReseedAtMs != null ? new Date(scheduleCache.lastReseedAtMs).toISOString() : null,
  };
}

/**
 * @param {?number} intervalHours positive number to enable/update, null/0 to disable
 * @returns {Promise<{intervalHours: ?number, nextRunAt: ?string}>}
 */
export async function setReseedSchedule(intervalHours) {
  const normalized = intervalHours && intervalHours > 0 ? intervalHours : null;
  const nextRunAtMs = normalized ? Date.now() + msFromHours(normalized) : null;

  await pool.query(
    `INSERT INTO reseed_schedule (id, interval_hours, next_run_at_ms)
     VALUES (1, ?, ?)
     ON DUPLICATE KEY UPDATE interval_hours = VALUES(interval_hours), next_run_at_ms = VALUES(next_run_at_ms)`,
    [normalized, nextRunAtMs]
  );

  scheduleCache = { ...scheduleCache, intervalHours: normalized, nextRunAtMs };
  return getReseedSchedule();
}
