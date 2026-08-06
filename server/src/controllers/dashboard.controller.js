/**
 * Owner: Person 4 (Enrico) - Dashboard & Stock Report Page.
 * TODO: combine data from stockLookup.service.js (Person 2) to compute
 * 52-week high/low and format the StockDetail shape from shared/types.
 *
 * Also hosts the personal, user-owned CRUD features for these pages:
 * stock notes, starred stocks, and price targets (see
 * dashboardPersonal.service.js and migration 014). All are scoped to the
 * logged-in user (req.userId, set by requireAuth).
 */
import * as personal from "../services/dashboardPersonal.service.js";
import { sendInternalError } from "../utils/errors.js";

function badRequest(res, message) {
  return res.status(400).json({ success: false, error: { message } });
}
function notFound(res, message) {
  return res.status(404).json({ success: false, error: { message } });
}

export async function getStockSummary(_req, res) {
  res.status(501).json({ success: false, error: { message: "Not implemented: getStockSummary" } });
}

/* ------------------------------ Stock notes ------------------------------ */

export async function listNotes(req, res) {
  const { exchangeCode, stockCode } = req.params;
  try {
    const notes = await personal.listNotes(req.userId, exchangeCode, stockCode);
    res.json({ success: true, data: notes });
  } catch (err) {
    sendInternalError(res, err, "[dashboard] listNotes");
  }
}

export async function createNote(req, res) {
  const { exchangeCode, stockCode } = req.params;
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body) return badRequest(res, "Note body is required");
  if (body.length > 2000) return badRequest(res, "Note is too long (max 2000 characters)");
  try {
    const note = await personal.createNote(req.userId, exchangeCode, stockCode, body);
    res.status(201).json({ success: true, data: note });
  } catch (err) {
    sendInternalError(res, err, "[dashboard] createNote");
  }
}

export async function updateNote(req, res) {
  const { id } = req.params;
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body) return badRequest(res, "Note body is required");
  if (body.length > 2000) return badRequest(res, "Note is too long (max 2000 characters)");
  try {
    const ok = await personal.updateNote(req.userId, id, body);
    if (!ok) return notFound(res, "Note not found");
    res.json({ success: true, data: { id, body } });
  } catch (err) {
    sendInternalError(res, err, "[dashboard] updateNote");
  }
}

export async function deleteNote(req, res) {
  try {
    const ok = await personal.deleteNote(req.userId, req.params.id);
    if (!ok) return notFound(res, "Note not found");
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    sendInternalError(res, err, "[dashboard] deleteNote");
  }
}

/* ----------------------------- Starred stocks ---------------------------- */

export async function listStarred(req, res) {
  try {
    const starred = await personal.listStarred(req.userId);
    res.json({ success: true, data: starred });
  } catch (err) {
    sendInternalError(res, err, "[dashboard] listStarred");
  }
}

export async function addStar(req, res) {
  const exchangeCode = req.body?.exchangeCode;
  const stockCode = req.body?.stockCode;
  if (!exchangeCode || !stockCode) return badRequest(res, "exchangeCode and stockCode are required");
  try {
    const star = await personal.addStar(req.userId, exchangeCode, stockCode);
    res.status(201).json({ success: true, data: star });
  } catch (err) {
    sendInternalError(res, err, "[dashboard] addStar");
  }
}

export async function removeStar(req, res) {
  const { exchangeCode, stockCode } = req.params;
  try {
    const ok = await personal.removeStar(req.userId, exchangeCode, stockCode);
    res.json({ success: true, data: { deleted: ok } });
  } catch (err) {
    sendInternalError(res, err, "[dashboard] removeStar");
  }
}

/* ----------------------------- Price targets ----------------------------- */

export async function getTarget(req, res) {
  const { exchangeCode, stockCode } = req.params;
  try {
    const target = await personal.getTarget(req.userId, exchangeCode, stockCode);
    // Always return a data field (client wrapper treats undefined data as an
    // error); null means "no target set".
    res.json({ success: true, data: target });
  } catch (err) {
    sendInternalError(res, err, "[dashboard] getTarget");
  }
}

export async function setTarget(req, res) {
  const { exchangeCode, stockCode } = req.params;
  const targetPrice = Number(req.body?.targetPrice);
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
    return badRequest(res, "targetPrice must be a positive number");
  }
  try {
    const target = await personal.setTarget(req.userId, exchangeCode, stockCode, targetPrice);
    res.json({ success: true, data: target });
  } catch (err) {
    sendInternalError(res, err, "[dashboard] setTarget");
  }
}

export async function deleteTarget(req, res) {
  const { exchangeCode, stockCode } = req.params;
  try {
    const ok = await personal.deleteTarget(req.userId, exchangeCode, stockCode);
    res.json({ success: true, data: { deleted: ok } });
  } catch (err) {
    sendInternalError(res, err, "[dashboard] deleteTarget");
  }
}