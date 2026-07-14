// Admin dashboard calls (Person 2). Uses the shared `api` wrapper from
// client.js so auth headers and error handling stay consistent.
import { api } from "./client";

export function getStats() {
  return api.get("/admin/stats");
}

export function listUsers() {
  return api.get("/admin/users");
}

export function revokeUser(userId) {
  return api.post(`/admin/users/${userId}/revoke`);
}

export function restoreUser(userId) {
  return api.post(`/admin/users/${userId}/restore`);
}

export function setAdmin(userId, isAdmin) {
  return api.post(`/admin/users/${userId}/admin`, { isAdmin });
}

export function getUserPayments(userId) {
  return api.get(`/admin/users/${userId}/payments`);
}

export function clearCache() {
  return api.post("/admin/cache/clear");
}

/**
 * Downloads a file from an authenticated API endpoint. Can't reuse the
 * shared `api` wrapper from client.js for this - it always calls
 * res.json() and expects the { success, data } envelope, but these export
 * endpoints send a raw file (CSV or PDF) with a Content-Disposition header
 * instead. Fetches the file as a blob and triggers a normal browser
 * download via a throwaway <a> tag (the standard way to save a fetched
 * blob without the browser ever navigating away from the app).
 * @param {string} path e.g. "/admin/export/users.csv" or "/admin/export/summary.pdf"
 * @param {string} fallbackFilename used if the server didn't send one
 */
async function downloadFile(path, fallbackFilename) {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Export failed (status ${res.status})`);
  }

  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filenameMatch = disposition.match(/filename="([^"]+)"/);
  const filename = filenameMatch?.[1] ?? fallbackFilename;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportUsersCsv() {
  return downloadFile("/admin/export/users.csv", "users.csv");
}

export function exportPaymentsCsv() {
  return downloadFile("/admin/export/payments.csv", "payments.csv");
}

export function exportSummaryPdf() {
  return downloadFile("/admin/export/summary.pdf", "admin-summary.pdf");
}
