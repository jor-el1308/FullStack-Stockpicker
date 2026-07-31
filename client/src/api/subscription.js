// Subscription/billing + self-service account calls (Person 2). Uses the
// shared `api` wrapper from client.js so the httpOnly session cookie and
// error handling stay consistent.
import { api } from "./client";

export function getSubscriptionStatus() {
  return api.get("/subscription/status");
}

// The logged-in user's own payment history (amount, date, status). Backed by
// GET /api/subscription/payments - the same data admins see per-user.
export function listMyPayments() {
  return api.get("/subscription/payments");
}

// Native cancel - schedules cancellation at the end of the paid period (the
// account stays active until then). Server-side counterpart of Settings'
// "Cancel subscription" button. See server/src/services/subscription.service.js.
export function cancelSubscription() {
  return api.post("/subscription/cancel");
}

// Undoes a pending cancellation.
export function resumeSubscription() {
  return api.post("/subscription/resume");
}

// Hands back a URL to Stripe's hosted billing portal (invoices, payment
// method, cancel) - the browser then redirects there.
export function createBillingPortalSession() {
  return api.post("/subscription/billing-portal");
}

// Updates the logged-in user's own display name and/or profile picture.
// Pass only what changed, e.g. { name } or { avatar } (a data-URL image, or
// null to remove the photo). Returns the refreshed public user. Email
// changes go through the verified two-step flow below. See
// server/src/controllers/auth.controller.js updateProfile().
export function updateMyProfile(patch) {
  return api.patch("/auth/me", patch);
}

// Step 1 of changing the login email: emails a 6-digit code to the NEW
// address to verify the user controls it. Nothing changes on the account
// until verifyEmailChange() confirms the code. See auth.controller.js.
export function requestEmailChange(email) {
  return api.post("/auth/email-change/request", { email });
}

// Step 2: confirms the code emailed to the new address and applies the email
// change. Returns the refreshed public user. See auth.controller.js.
export function verifyEmailChange(email, code) {
  return api.post("/auth/email-change/verify", { email, code });
}

// Changes the logged-in user's password. Re-confirms the current password
// (checked server-side). See server/src/controllers/auth.controller.js.
export function changeMyPassword(currentPassword, newPassword) {
  return api.post("/auth/change-password", { currentPassword, newPassword });
}

// Permanently deletes the logged-in user's own account. Re-confirms the
// account password (checked server-side). Payment history is retained but
// anonymized. See server/src/controllers/auth.controller.js deleteAccount().
export function deleteMyAccount(password) {
  return api.delete("/auth/me", { password });
}
