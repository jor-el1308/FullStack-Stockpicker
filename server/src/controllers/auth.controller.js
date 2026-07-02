/**
 * Owner: Person 1 (Yong Wee) - Auth & User Management.
 * TODO: wire up to auth.service.js (bcrypt hashing, JWT issuance) and the
 * `users` / `saved_criteria_set` / `saved_criteria_item` tables from
 * server/src/db/schema.sql.
 */

export async function signup(_req, res) {
  res.status(501).json({ success: false, error: { message: "Not implemented: signup" } });
}

export async function login(_req, res) {
  res.status(501).json({ success: false, error: { message: "Not implemented: login" } });
}

export async function getProfile(_req, res) {
  res.status(501).json({ success: false, error: { message: "Not implemented: getProfile" } });
}

export async function listCriteriaSets(_req, res) {
  res.status(501).json({ success: false, error: { message: "Not implemented: listCriteriaSets" } });
}

export async function saveCriteriaSet(_req, res) {
  res.status(501).json({ success: false, error: { message: "Not implemented: saveCriteriaSet" } });
}
