import { randomBytes } from "node:crypto";

/**
 * Owner: Person 1 (Yong Wee) - Auth & User Management.
 *
 * "Sign in with Google" via the standard OAuth 2.0 authorization code flow
 * (server/src/controllers/auth.controller.js's googleOAuthStart() /
 * googleOAuthCallback()): the client is just a plain link to
 * GET /api/auth/oauth/google (client/src/pages/Login.jsx's Google button),
 * no Google JS SDK involved. Uses the built-in fetch (same pattern as
 * ai.service.js's calls to Gemini/OpenRouter) rather than pulling in
 * google-auth-library, since all that's needed here is two plain HTTPS
 * calls against well-known Google endpoints.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

function getClientId() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!id) throw new Error("GOOGLE_CLIENT_ID is not set. See server/.env.example.");
  return id;
}

function getClientSecret() {
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET is not set. See server/.env.example.");
  return secret;
}

function getRedirectUri() {
  const uri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!uri) throw new Error("GOOGLE_REDIRECT_URI is not set. See server/.env.example.");
  return uri;
}

/**
 * A random, unguessable value the caller stores (as a short-lived cookie)
 * and Google echoes back on the callback unchanged. Comparing the two
 * closes the CSRF hole where an attacker could otherwise craft their own
 * "GET /oauth/google/callback?code=..." link using a code from *their own*
 * Google account and get a victim's browser to complete the flow (and end
 * up authenticated as, or with an account linked to, the attacker's Google
 * identity) - see googleOAuthStart()/googleOAuthCallback().
 */
export function generateOAuthState() {
  return randomBytes(24).toString("base64url");
}

/**
 * Builds the URL to send the browser to for the Google consent screen.
 * @param {string} state
 */
export function buildGoogleAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    // Always show the account chooser instead of silently reusing whichever
    // Google session happens to be active in the browser - avoids someone
    // getting logged into the wrong Google account's linked app account on
    // a shared machine.
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchanges the one-time authorization code Google redirected back with for
 * an access token, then uses that to fetch the profile (email, name,
 * picture, and the stable Google account id). Two calls because the
 * userinfo endpoint only accepts an access token, not the auth code
 * directly.
 * @param {string} code
 * @returns {Promise<{ googleId: string, email: string, name: string, avatar: string | null }>}
 */
export async function exchangeCodeForProfile(code) {
  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Google token exchange failed (${tokenRes.status})`);
  }
  const tokenData = await tokenRes.json();

  const profileRes = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!profileRes.ok) {
    throw new Error(`Google profile fetch failed (${profileRes.status})`);
  }
  const profile = await profileRes.json();

  // email_verified guards against treating an unverified address (Google
  // does allow those for some account types) as proof of ownership - see
  // auth.service.js's findOrCreateGoogleUser(), which links onto an existing
  // password account by email.
  if (!profile.email || profile.email_verified !== true) {
    throw new Error("Google account has no verified email address");
  }

  return {
    googleId: profile.sub,
    email: profile.email.toLowerCase(),
    name: profile.name || profile.email,
    avatar: profile.picture ?? null,
  };
}
