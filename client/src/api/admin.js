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
