/**
 * Owner: Person 4 (Enrico) — Dashboard & Stock Report.
 * API calls for the personal, user-owned features. All hit /api/dashboard/*
 * (see server/src/routes/dashboard.routes.js) and require a logged-in,
 * active account. Uses the shared fetch wrapper in api/client.js.
 */
import { api } from "./client";

/* ------------------------------ Stock notes ------------------------------ */

// GET → Note[] ({ id, exchangeCode, stockCode, body, createdAt, updatedAt })
export function listNotes(exchangeCode, stockCode) {
  return api.get(`/dashboard/notes/${exchangeCode}/${stockCode}`);
}
export function createNote(exchangeCode, stockCode, body) {
  return api.post(`/dashboard/notes/${exchangeCode}/${stockCode}`, { body });
}
export function updateNote(id, body) {
  return api.patch(`/dashboard/notes/${id}`, { body });
}
export function deleteNote(id) {
  return api.delete(`/dashboard/notes/${id}`);
}

/* ----------------------------- Starred stocks ---------------------------- */

// GET → StarredStock[] ({ exchangeCode, stockCode, stockName, createdAt })
export function listStarred() {
  return api.get(`/dashboard/starred`);
}
export function addStar(exchangeCode, stockCode) {
  return api.post(`/dashboard/starred`, { exchangeCode, stockCode });
}
export function removeStar(exchangeCode, stockCode) {
  return api.delete(`/dashboard/starred/${exchangeCode}/${stockCode}`);
}

/* ----------------------------- Price targets ----------------------------- */

// GET → { exchangeCode, stockCode, targetPrice, updatedAt } | null
export function getTarget(exchangeCode, stockCode) {
  return api.get(`/dashboard/target/${exchangeCode}/${stockCode}`);
}
export function setTarget(exchangeCode, stockCode, targetPrice) {
  return api.post(`/dashboard/target/${exchangeCode}/${stockCode}`, { targetPrice });
}
export function deleteTarget(exchangeCode, stockCode) {
  return api.delete(`/dashboard/target/${exchangeCode}/${stockCode}`);
}