import { randomBytes } from "node:crypto";

/**
 * Owner: Person 1 (Yong Wee) - Auth & User Management.
 *
 * "Sign in with Microsoft" via the standard OAuth 2.0 authorization code
 * flow, mirroring googleOAuth.service.js exactly: a plain link to
 * GET /api/auth/oauth/microsoft (client/src/pages/Login.jsx's Microsoft
 * button), handled by microsoftOAuthStart()/microsoftOAuthCallback() in
 * auth.controller.js. Uses the built-in fetch against the Microsoft
 * identity platform (v2.0 endpoint) and Microsoft Graph, same reasoning as
 * the Google service for not pulling in @azure/msal-node.
 */

const TOKEN_SCOPE = "openid email profile User.Read";
const GRAPH_USERINFO_ENDPOINT = "https://graph.microsoft.com/v1.0/me";

function getClientId() {
  const id = process.env.MS_CLIENT_ID?.trim();
  if (!id) throw new Error("MS_CLIENT_ID is not set. See server/.env.example.");
  return id;
}

function getClientSecret() {
  const secret = process.env.MS_CLIENT_SECRET?.trim();
  if (!secret) throw new Error("MS_CLIENT_SECRET is not set. See server/.env.example.");
  return secret;
}

function getRedirectUri() {
  const uri = process.env.MS_REDIRECT_URI?.trim();
  if (!uri) throw new Error("MS_REDIRECT_URI is not set. See server/.env.example.");
  return uri;
}

// "common" (the default) accepts sign-ins from both personal Microsoft
// accounts and any work/school (Azure AD) tenant. Set to a specific tenant
// id to restrict sign-in to one organization.
function getTenantId() {
  return process.env.MS_TENANT_ID?.trim() || "common";
}

function getAuthEndpoint() {
  return `https://login.microsoftonline.com/${getTenantId()}/oauth2/v2.0/authorize`;
}

function getTokenEndpoint() {
  return `https://login.microsoftonline.com/${getTenantId()}/oauth2/v2.0/token`;
}

/**
 * A random, unguessable value the caller stores (as a short-lived cookie)
 * and Microsoft echoes back on the callback unchanged - same CSRF purpose
 * as googleOAuthService.generateOAuthState(), see its comment for the
 * attack this closes.
 */
export function generateOAuthState() {
  return randomBytes(24).toString("base64url");
}

/**
 * Builds the URL to send the browser to for the Microsoft consent screen.
 * @param {string} state
 */
export function buildMicrosoftAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: TOKEN_SCOPE,
    state,
    // Same reasoning as Google's prompt: "select_account" - always show the
    // account picker instead of silently reusing whichever Microsoft
    // session happens to be active in the browser.
    prompt: "select_account",
  });
  return `${getAuthEndpoint()}?${params.toString()}`;
}

/**
 * Exchanges the one-time authorization code Microsoft redirected back with
 * for an access token, then uses that to fetch the profile (email, name,
 * and the stable per-tenant account id) from Microsoft Graph. Two calls for
 * the same reason as the Google service: the Graph /me endpoint only
 * accepts an access token, not the auth code directly.
 * @param {string} code
 * @returns {Promise<{ microsoftId: string, email: string, name: string, avatar: string | null }>}
 */
export async function exchangeCodeForProfile(code) {
  const tokenRes = await fetch(getTokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
      scope: TOKEN_SCOPE,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Microsoft token exchange failed (${tokenRes.status})`);
  }
  const tokenData = await tokenRes.json();

  const profileRes = await fetch(GRAPH_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!profileRes.ok) {
    throw new Error(`Microsoft profile fetch failed (${profileRes.status})`);
  }
  const profile = await profileRes.json();

  // Graph doesn't expose a Google-style `email_verified` flag. `mail` is the
  // account's actual mailbox address, verified by Microsoft (personal
  // accounts) or the org's admin (work/school accounts); it's null for some
  // Azure AD accounts that were never assigned a mailbox, in which case
  // `userPrincipalName` (the sign-in identifier, typically email-shaped) is
  // the best available fallback.
  const email = profile.mail || profile.userPrincipalName;
  if (!email) {
    throw new Error("Microsoft account has no usable email address");
  }

  return {
    microsoftId: profile.id,
    email: email.toLowerCase(),
    name: profile.displayName || email,
    avatar: null,
  };
}
