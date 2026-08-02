import { z } from "zod";
import * as adminService from "../services/admin.service.js";
import * as ingestionService from "../services/ingestion.service.js";
import { toCsv } from "../utils/csv.js";
import { buildAdminSummaryPdf } from "../utils/pdfReport.js";
import { sendInternalError } from "../utils/errors.js";

// Same core rules as auth.controller.js's signupSchema (email/password/name),
// plus the two admin-only flags. Both default off, so a bare create makes an
// inactive, non-admin account exactly like public signup.
const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(128),
  isActive: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
});

/**
 * Owner: Person 2 (Charles) - Admin Dashboard.
 * All routes here are gated by requireAuth + requireAdmin - see
 * server/src/routes/admin.routes.js.
 */

export async function listUsers(_req, res) {
  try {
    const users = await adminService.listUsers();
    res.json({ success: true, data: users });
  } catch (err) {
    sendInternalError(res, err, "[admin] listUsers");
  }
}

export async function getStats(_req, res) {
  try {
    const stats = await adminService.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    sendInternalError(res, err, "[admin] getStats");
  }
}

export async function createUser(req, res) {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ success: false, error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }
  try {
    const user = await adminService.createUser(parsed.data);
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    // Email column is UNIQUE - a clash comes back as ER_DUP_ENTRY. Same
    // friendly 409 as auth.controller.js's signup().
    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ success: false, error: { message: "An account with this email already exists" } });
    }
    sendInternalError(res, err, "[admin] createUser");
  }
}

export async function revokeUser(req, res) {
  const targetId = req.params.id;
  if (targetId === req.userId) {
    return res.status(400).json({ success: false, error: { message: "You can't revoke your own access" } });
  }
  try {
    const user = await adminService.revokeUser(targetId);
    if (!user) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    sendInternalError(res, err, "[admin] revokeUser");
  }
}

export async function deleteUser(req, res) {
  const targetId = req.params.id;
  if (targetId === req.userId) {
    return res.status(400).json({ success: false, error: { message: "You can't delete your own account here" } });
  }
  try {
    const result = await adminService.deleteUser(targetId);
    if (!result.deleted) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    sendInternalError(res, err, "[admin] deleteUser");
  }
}

export async function restoreUser(req, res) {
  try {
    const user = await adminService.restoreUser(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    sendInternalError(res, err, "[admin] restoreUser");
  }
}

export async function setAdmin(req, res) {
  const targetId = req.params.id;
  const { isAdmin } = req.body;
  if (typeof isAdmin !== "boolean") {
    return res.status(400).json({ success: false, error: { message: "isAdmin must be true or false" } });
  }
  if (targetId === req.userId && !isAdmin) {
    return res.status(400).json({ success: false, error: { message: "You can't remove your own admin access" } });
  }
  try {
    const user = await adminService.setAdmin(targetId, isAdmin);
    if (!user) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    sendInternalError(res, err, "[admin] setAdmin");
  }
}

export async function getUserPayments(req, res) {
  try {
    const payments = await adminService.getUserPayments(req.params.id);
    res.json({ success: true, data: payments });
  } catch (err) {
    sendInternalError(res, err, "[admin] getUserPayments");
  }
}

export function clearCache(_req, res) {
  const result = adminService.clearCache();
  res.json({ success: true, data: result });
}

/**
 * Kicks off ingestion/ingest.py (see ingestion.service.js) to pull fresh
 * prices/market cap/dividends/financials from Yahoo Finance into MySQL -
 * lets an admin refresh stock data from the website instead of running
 * the script by hand. Runs in the background; poll getReseedStatus for
 * progress.
 */
export function reseedData(_req, res) {
  const result = ingestionService.startReseed();
  if (!result.started) {
    const status = result.alreadyRunning ? 409 : 500;
    const message = result.alreadyRunning ? "A reseed is already running" : result.error;
    return res.status(status).json({ success: false, error: { message } });
  }
  res.json({ success: true, data: { started: true } });
}

export function getReseedStatus(_req, res) {
  res.json({ success: true, data: ingestionService.getReseedStatus() });
}

export function getReseedSchedule(_req, res) {
  res.json({ success: true, data: ingestionService.getReseedSchedule() });
}

/**
 * body: { intervalHours: number|null } - a positive number enables/updates
 * the auto-reseed schedule, null (or omitted/0) disables it.
 */
export async function setReseedSchedule(req, res) {
  const { intervalHours } = req.body;
  const isValid =
    intervalHours === null ||
    intervalHours === undefined ||
    (typeof intervalHours === "number" && Number.isFinite(intervalHours) && intervalHours > 0);
  if (!isValid) {
    return res
      .status(400)
      .json({ success: false, error: { message: "intervalHours must be a positive number, or null to disable" } });
  }
  try {
    const schedule = await ingestionService.setReseedSchedule(intervalHours ?? null);
    res.json({ success: true, data: schedule });
  } catch (err) {
    sendInternalError(res, err, "[admin] setReseedSchedule");
  }
}

const USERS_CSV_COLUMNS = [
  { key: "id", header: "User ID" },
  { key: "email", header: "Email" },
  { key: "name", header: "Name" },
  { key: "isActive", header: "Active" },
  { key: "isAdmin", header: "Admin" },
  { key: "createdAt", header: "Signed Up" },
  { key: "activatedAt", header: "Activated" },
  { key: "paymentCount", header: "Payment Count" },
  { key: "totalPaidDisplay", header: "Total Paid" },
];

const PAYMENTS_CSV_COLUMNS = [
  { key: "id", header: "Payment ID" },
  { key: "userEmail", header: "User Email" },
  { key: "userName", header: "User Name" },
  { key: "amountDisplay", header: "Amount" },
  { key: "currency", header: "Currency" },
  { key: "status", header: "Status" },
  { key: "paymentMethod", header: "Payment Method" },
  { key: "paidAt", header: "Paid At" },
];

/**
 * cents -> a plain decimal string (999 -> "9.99"). Deliberately not
 * Intl.NumberFormat/currency-symbol formatting - this is a CSV meant to be
 * dropped into a spreadsheet, and a bare number is easier to sum there than
 * a locale-formatted currency string.
 * @param {number} cents
 */
function centsToDecimalString(cents) {
  return (Number(cents) / 100).toFixed(2);
}

/**
 * Sends `csv` as a downloadable file. Not wrapped in the usual
 * { success, data } JSON envelope (see other controllers here) - this is a
 * file response, not a JSON API response, so the frontend fetches it
 * differently too (see client/src/api/admin.js's downloadFile()).
 * @param {import("express").Response} res
 * @param {string} filename
 * @param {string} csv
 */
function sendCsv(res, filename, csv) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

export async function exportUsersCsv(_req, res) {
  try {
    const users = await adminService.listUsersForExport();
    const rows = users.map((u) => ({ ...u, totalPaidDisplay: centsToDecimalString(u.totalPaidCents) }));
    const csv = toCsv(USERS_CSV_COLUMNS, rows);
    sendCsv(res, `users-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (err) {
    sendInternalError(res, err, "[admin] exportUsersCsv");
  }
}

export async function exportPaymentsCsv(_req, res) {
  try {
    const payments = await adminService.listAllPaymentsForExport();
    const rows = payments.map((p) => ({
      ...p,
      amountDisplay: centsToDecimalString(p.amountCents),
    }));
    const csv = toCsv(PAYMENTS_CSV_COLUMNS, rows);
    sendCsv(res, `payments-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (err) {
    sendInternalError(res, err, "[admin] exportPaymentsCsv");
  }
}

/**
 * One-shot branded PDF combining the dashboard's stat cards with a full
 * user table - see utils/pdfReport.js. Same currency assumption as
 * getStats() below (single-currency, SGD from the Stripe test subscription
 * fee - see subscription.service.js's SUBSCRIPTION_CURRENCY).
 */
export async function exportSummaryPdf(_req, res) {
  try {
    const [stats, users] = await Promise.all([adminService.getStats(), adminService.listUsersForExport()]);
    const pdfBuffer = await buildAdminSummaryPdf({ stats, users, currency: "SGD" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="admin-summary-${new Date().toISOString().slice(0, 10)}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (err) {
    sendInternalError(res, err, "[admin] exportSummaryPdf");
  }
}
