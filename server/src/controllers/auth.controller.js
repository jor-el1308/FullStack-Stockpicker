import { z } from "zod";
import * as authService from "../services/auth.service.js";
import * as googleOAuthService from "../services/googleOAuth.service.js";
import * as microsoftOAuthService from "../services/microsoftOAuth.service.js";
import { sendOtpEmail, sendEmailChangeOtpEmail } from "../utils/mailer.js";
import { parseDurationMs } from "../config/jwt.js";
import { sendInternalError } from "../utils/errors.js";

/**
 * Owner: Person 1 (Yong Wee) - Auth & User Management.
 *
 * NOTE for Person 1 (added by Person 2 for subscription/paywall + admin
 * dashboard - please review): toAuthUser() now also exposes
 * isActive/activatedAt/isAdmin so the frontend knows right after
 * signup/login whether to route to the payment page
 * (client/src/pages/Activate.jsx) and whether to show the Admin nav link.
 * New accounts come back with isActive: false and isAdmin: false until
 * they pay / get promoted.
 *
 * NOTE for Person 1 (added by Person 2 for login 2FA - please review):
 * login() no longer returns a session token directly - see its comment
 * below. verifyLoginOtp() and resendLoginOtp() are the new step 2.
 */

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const verifyOtpSchema = z.object({
  preAuthToken: z.string().min(1),
  code: z.string().length(6, "Code must be 6 digits"),
});

const resendOtpSchema = z.object({
  preAuthToken: z.string().min(1),
});

const criteriaRangeSchema = z
  .object({
    key: z.string().min(1),
    min: z.number().optional(),
    max: z.number().optional(),
    weight: z.number().min(0).max(10).optional(),
  })
  .refine((range) => range.min !== undefined || range.max !== undefined || range.weight !== undefined, {
    message: "Each criteria range needs a min, max, and/or weight value",
  });

const saveCriteriaSetSchema = z.object({
  name: z.string().min(1).max(128),
  criteria: z.array(criteriaRangeSchema).min(1),
});

const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required to delete your account"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

// Profile picture, stored inline as a resized/compressed data URL. The
// client caps the real size by resizing to a small square before upload;
// this is the server-side backstop (format + a generous length ceiling that
// stays under the express.json body limit in app.js). `null` clears it.
const avatarDataUrl = z
  .string()
  .max(2_000_000, "Image is too large - please choose a smaller one")
  .regex(/^data:image\/(png|jpe?g|webp|gif);base64,/, "Unsupported image format");

// Profile edit via PATCH /me covers the display name and profile picture.
// Changing the login email is a separate, verified two-step flow
// (email-change/request + email-change/verify) since the new address has to
// be proven first. Both fields optional, but at least one must be present.
const updateProfileSchema = z
  .object({
    name: z.string().min(1).max(128).optional(),
    avatar: avatarDataUrl.nullable().optional(),
  })
  .refine((body) => body.name !== undefined || "avatar" in body, {
    message: "Nothing to update",
  });

const requestEmailChangeSchema = z.object({
  email: z.string().email(),
});

const verifyEmailChangeSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, "Code must be 6 digits"),
});

const SESSION_COOKIE = "token";

/**
 * Sets the session JWT as an httpOnly cookie instead of handing it back in
 * the JSON body for the client to store in localStorage (see
 * client/src/api/client.js) - localStorage is readable by any script on the
 * page, so an XSS bug anywhere (a dependency, a future dangerouslySetHTML)
 * could exfiltrate the token and fully impersonate the user with no way to
 * revoke it. An httpOnly cookie can't be read by JS at all.
 * @param {import("express").Response} res
 * @param {string} token
 */
function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: parseDurationMs(process.env.JWT_EXPIRES_IN ?? "7d"),
  });
}

function toAuthUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar ?? null,
    createdAt: user.createdAt,
    isActive: Boolean(user.isActive),
    activatedAt: user.activatedAt ?? null,
    isAdmin: Boolean(user.isAdmin),
  };
}

function badRequest(res, parsed) {
  return res
    .status(400)
    .json({ success: false, error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
}

export async function signup(req, res) {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed);
  const { email, password, name } = parsed.data;

  try {
    const existing = await authService.findUserByEmail(email);
    if (existing) {
      return res
        .status(409)
        .json({ success: false, error: { message: "An account with this email already exists" } });
    }

    const user = await authService.createUser({ email, password, name });
    const token = authService.issueToken(user);
    setSessionCookie(res, token);
    res.status(201).json({ success: true, data: { user: toAuthUser(user) } });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ success: false, error: { message: "An account with this email already exists" } });
    }
    sendInternalError(res, err, "[auth] signup");
  }
}

/**
 * Step 1 of login 2FA (Person 1's flow, added by Person 2). A correct
 * email+password no longer returns a session token directly - instead this
 * emails a one-time code and hands back a short-lived preAuthToken. The
 * client must then call verifyLoginOtp() below with that token + the code
 * to actually get a session token.
 */
export async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed);
  const { email, password } = parsed.data;

  try {
    const user = await authService.findUserByEmail(email);
    const passwordMatches = user ? await authService.verifyPassword(password, user.passwordHash) : false;
    if (!user || !passwordMatches) {
      return res.status(401).json({ success: false, error: { message: "Invalid email or password" } });
    }

    const preAuthToken = authService.issuePreAuthToken(user);
    const code = await authService.createLoginOtp(user.id);
    const result = await sendOtpEmail({ to: user.email, name: user.name, code });
    if (result.error) {
      return res
        .status(500)
        .json({ success: false, error: { message: "Could not send verification code - please try again" } });
    }

    res.json({ success: true, data: { mfaRequired: true, preAuthToken, email: user.email } });
  } catch (err) {
    sendInternalError(res, err, "[auth] login");
  }
}

/**
 * Step 2 of login 2FA: exchanges a preAuthToken + the emailed code for a
 * real session token, the same shape login() used to return directly.
 */
export async function verifyLoginOtp(req, res) {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed);
  const { preAuthToken, code } = parsed.data;

  let userId;
  try {
    userId = authService.verifyPreAuthToken(preAuthToken);
  } catch {
    return res
      .status(401)
      .json({ success: false, error: { message: "Verification session expired - please log in again" } });
  }

  try {
    const ok = await authService.verifyLoginOtp(userId, code);
    if (!ok) {
      return res.status(401).json({ success: false, error: { message: "Incorrect or expired code" } });
    }

    const user = await authService.findUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }

    const token = authService.issueToken(user);
    setSessionCookie(res, token);
    res.json({ success: true, data: { user: toAuthUser(user) } });
  } catch (err) {
    sendInternalError(res, err, "[auth] verifyLoginOtp");
  }
}

/**
 * Clears the session cookie set at login/signup. Not strictly required for
 * server-side security (the JWT stays valid until it expires either way -
 * this app doesn't track a revocation list) but ensures the browser doesn't
 * keep sending a cookie the user asked to be logged out from.
 */
export function logout(_req, res) {
  res.clearCookie(SESSION_COOKIE);
  res.json({ success: true, data: { loggedOut: true } });
}

// Short-lived cookies holding the CSRF `state` value for each provider's
// OAuth round trip - see googleOAuthService/microsoftOAuthService's
// generateOAuthState(). Separate cookies (rather than one shared name) so a
// Google flow started in one tab can't be completed against a Microsoft
// callback URL or vice versa.
const OAUTH_STATE_COOKIE = "g_oauth_state";
const MS_OAUTH_STATE_COOKIE = "ms_oauth_state";

function getOAuthClientBaseUrl() {
  return process.env.OAUTH_SUCCESS_REDIRECT?.trim() || "http://localhost:5173/";
}

/**
 * Sends the browser back to the login page with a query string the client
 * (client/src/pages/Login.jsx) reads on mount: `oauth=success` to pull the
 * now-logged-in user via GET /auth/me, or `oauth=error&message=...` to show
 * why sign-in didn't complete.
 */
function redirectToLogin(res, params) {
  const url = new URL("/login", getOAuthClientBaseUrl());
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  res.redirect(url.toString());
}

/**
 * Step 1 of "Sign in with Google" (client/src/pages/Login.jsx's Google
 * button is a plain link to this route, GET /api/auth/oauth/google - no
 * Google JS SDK involved). Stashes a random CSRF `state` value in a
 * short-lived cookie and sends the browser to Google's consent screen with
 * that same value, so the callback below can confirm the response actually
 * belongs to a flow this server started.
 */
export function googleOAuthStart(_req, res) {
  try {
    const state = googleOAuthService.generateOAuthState();
    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 5 * 60 * 1000,
    });
    res.redirect(googleOAuthService.buildGoogleAuthUrl(state));
  } catch (err) {
    console.error("[auth] googleOAuthStart failed:", err.message);
    redirectToLogin(res, { oauth: "error", message: "Google sign-in is not available right now" });
  }
}

/**
 * Step 2: Google redirects the browser back here with either an
 * authorization `code` (consent granted) or an `error` (denied/cancelled).
 * A valid code is exchanged for the user's Google profile, which either
 * creates a brand-new account or links onto/logs into an existing one by
 * email (see authService.findOrCreateGoogleUser()) - then a normal session
 * cookie is issued, same as the end of password login.
 *
 * NOTE for Person 1/2 (please review): unlike password login, this does
 * NOT go through the email-OTP second factor (verifyLoginOtp() above) -
 * Google has already authenticated the user (and enforces its own 2FA if
 * the user has that turned on for their Google account), so re-prompting
 * for a code emailed to the same address would be redundant friction, not
 * extra security.
 */
export async function googleOAuthCallback(req, res) {
  const { code, state, error: googleError } = req.query;
  const expectedState = req.cookies?.[OAUTH_STATE_COOKIE];
  res.clearCookie(OAUTH_STATE_COOKIE);

  if (googleError) {
    return redirectToLogin(res, { oauth: "error", message: "Google sign-in was cancelled" });
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToLogin(res, {
      oauth: "error",
      message: "Google sign-in session expired - please try again",
    });
  }

  try {
    const profile = await googleOAuthService.exchangeCodeForProfile(code);
    const user = await authService.findOrCreateGoogleUser(profile);
    const token = authService.issueToken(user);
    setSessionCookie(res, token);
    redirectToLogin(res, { oauth: "success" });
  } catch (err) {
    console.error("[auth] googleOAuthCallback failed:", err.message);
    redirectToLogin(res, { oauth: "error", message: "Google sign-in failed - please try again" });
  }
}

/**
 * Step 1 of "Sign in with Microsoft" - mirrors googleOAuthStart() exactly,
 * against microsoftOAuthService instead.
 */
export function microsoftOAuthStart(_req, res) {
  try {
    const state = microsoftOAuthService.generateOAuthState();
    res.cookie(MS_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 5 * 60 * 1000,
    });
    res.redirect(microsoftOAuthService.buildMicrosoftAuthUrl(state));
  } catch (err) {
    console.error("[auth] microsoftOAuthStart failed:", err.message);
    redirectToLogin(res, { oauth: "error", message: "Microsoft sign-in is not available right now" });
  }
}

/**
 * Step 2: mirrors googleOAuthCallback() exactly, against
 * microsoftOAuthService/authService.findOrCreateMicrosoftUser() instead. Same
 * NOTE as googleOAuthCallback() applies here - Microsoft has already
 * authenticated the user, so this also skips the email-OTP second factor.
 */
export async function microsoftOAuthCallback(req, res) {
  const { code, state, error: msError } = req.query;
  const expectedState = req.cookies?.[MS_OAUTH_STATE_COOKIE];
  res.clearCookie(MS_OAUTH_STATE_COOKIE);

  if (msError) {
    return redirectToLogin(res, { oauth: "error", message: "Microsoft sign-in was cancelled" });
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToLogin(res, {
      oauth: "error",
      message: "Microsoft sign-in session expired - please try again",
    });
  }

  try {
    const profile = await microsoftOAuthService.exchangeCodeForProfile(code);
    const user = await authService.findOrCreateMicrosoftUser(profile);
    const token = authService.issueToken(user);
    setSessionCookie(res, token);
    redirectToLogin(res, { oauth: "success" });
  } catch (err) {
    console.error("[auth] microsoftOAuthCallback failed:", err.message);
    redirectToLogin(res, { oauth: "error", message: "Microsoft sign-in failed - please try again" });
  }
}

/**
 * Re-sends a fresh code for an in-progress login attempt (e.g. the first
 * email got lost/delayed). Requires the same preAuthToken issued by
 * login() - old codes for the user are invalidated by createLoginOtp().
 */
export async function resendLoginOtp(req, res) {
  const parsed = resendOtpSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed);

  let userId;
  try {
    userId = authService.verifyPreAuthToken(parsed.data.preAuthToken);
  } catch {
    return res
      .status(401)
      .json({ success: false, error: { message: "Verification session expired - please log in again" } });
  }

  try {
    const user = await authService.findUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }

    const code = await authService.createLoginOtp(userId);
    const result = await sendOtpEmail({ to: user.email, name: user.name, code });
    if (result.error) {
      return res
        .status(500)
        .json({ success: false, error: { message: "Could not resend verification code" } });
    }

    res.json({ success: true, data: { resent: true } });
  } catch (err) {
    sendInternalError(res, err, "[auth] resendLoginOtp");
  }
}

export async function getProfile(req, res) {
  try {
    const user = await authService.findUserById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }
    res.json({ success: true, data: toAuthUser(user) });
  } catch (err) {
    sendInternalError(res, err, "[auth] getProfile");
  }
}

/**
 * Updates the logged-in user's own display name and/or profile picture.
 * Changing the login email is handled separately (requestEmailChange/
 * verifyEmailChange below) because it needs the new address verified first.
 * An explicit `avatar: null` removes the current photo. Returns the refreshed
 * public user so the client can update its cached auth state in place (no
 * re-login needed).
 */
export async function updateProfile(req, res) {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed);

  const patch = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if ("avatar" in parsed.data) patch.avatar = parsed.data.avatar ?? null;

  try {
    const user = await authService.updateProfile(req.userId, patch);
    if (!user) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }
    res.json({ success: true, data: toAuthUser(user) });
  } catch (err) {
    sendInternalError(res, err, "[auth] updateProfile");
  }
}

/**
 * Step 1 of changing the login email: validates the requested address (well
 * formed, actually different, not already taken by another account), then
 * emails a one-time code to *that new address* to prove the user controls
 * it. Nothing on the account changes yet - the email only moves in step 2,
 * verifyEmailChange(), once the code comes back. Deliberately does not reveal
 * whether a colliding address belongs to someone else beyond the same 409
 * wording signup() uses.
 */
export async function requestEmailChange(req, res) {
  const parsed = requestEmailChangeSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed);
  const email = parsed.data.email.trim().toLowerCase();

  try {
    const me = await authService.findUserById(req.userId);
    if (!me) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }
    if (email === me.email.toLowerCase()) {
      return res
        .status(400)
        .json({ success: false, error: { message: "That's already your email address" } });
    }

    const existing = await authService.findUserByEmail(email);
    if (existing && existing.id !== req.userId) {
      return res
        .status(409)
        .json({ success: false, error: { message: "An account with this email already exists" } });
    }

    const code = await authService.createEmailChangeOtp(req.userId, email);
    const result = await sendEmailChangeOtpEmail({ to: email, name: me.name, code });
    if (result.error) {
      return res
        .status(500)
        .json({ success: false, error: { message: "Could not send verification code - please try again" } });
    }

    res.json({ success: true, data: { pending: true, email } });
  } catch (err) {
    sendInternalError(res, err, "[auth] requestEmailChange");
  }
}

/**
 * Step 2 of changing the login email: checks the code emailed to the pending
 * address and, on success, writes that address onto the account. The
 * uniqueness re-check + ER_DUP_ENTRY handling guard the race where someone
 * else claims the same address between step 1 and step 2. Returns the
 * refreshed public user so the client updates in place, no re-login needed.
 */
export async function verifyEmailChange(req, res) {
  const parsed = verifyEmailChangeSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed);
  const email = parsed.data.email.trim().toLowerCase();

  try {
    const ok = await authService.verifyEmailChangeOtp(req.userId, email, parsed.data.code);
    if (!ok) {
      return res.status(401).json({ success: false, error: { message: "Incorrect or expired code" } });
    }

    // Re-check uniqueness at the last moment - the address could have been
    // taken since the code was requested.
    const existing = await authService.findUserByEmail(email);
    if (existing && existing.id !== req.userId) {
      return res
        .status(409)
        .json({ success: false, error: { message: "An account with this email already exists" } });
    }

    const user = await authService.updateProfile(req.userId, { email });
    if (!user) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }
    res.json({ success: true, data: toAuthUser(user) });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ success: false, error: { message: "An account with this email already exists" } });
    }
    sendInternalError(res, err, "[auth] verifyEmailChange");
  }
}

/**
 * Changes the logged-in user's password. Verifies the current password
 * first (a session cookie alone shouldn't let someone at an unattended
 * device silently change it), rejects a no-op change, then stores the new
 * hash. The session cookie stays valid - the JWT isn't tied to the password.
 */
export async function changePassword(req, res) {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed);
  const { currentPassword, newPassword } = parsed.data;

  try {
    const auth = await authService.findAuthById(req.userId);
    if (!auth) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }
    const passwordMatches = await authService.verifyPassword(currentPassword, auth.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, error: { message: "Current password is incorrect" } });
    }
    if (currentPassword === newPassword) {
      return res
        .status(400)
        .json({ success: false, error: { message: "New password must be different from the current one" } });
    }

    await authService.updatePassword(req.userId, newPassword);
    res.json({ success: true, data: { changed: true } });
  } catch (err) {
    sendInternalError(res, err, "[auth] changePassword");
  }
}

/**
 * Permanently deletes the logged-in user's own account. Re-confirms the
 * account password first (a session cookie alone shouldn't be enough for an
 * irreversible, destructive action - the user's device could be unattended),
 * then deletes and clears the session cookie so the now-invalid session
 * isn't left lingering in the browser. Their payment history is retained but
 * anonymized - see authService.deleteAccount().
 */
export async function deleteAccount(req, res) {
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed);

  try {
    const auth = await authService.findAuthById(req.userId);
    if (!auth) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }
    const passwordMatches = await authService.verifyPassword(parsed.data.password, auth.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, error: { message: "Incorrect password" } });
    }

    await authService.deleteAccount(req.userId);
    res.clearCookie(SESSION_COOKIE);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    sendInternalError(res, err, "[auth] deleteAccount");
  }
}

export async function listCriteriaSets(req, res) {
  try {
    const sets = await authService.listCriteriaSets(req.userId);
    res.json({ success: true, data: sets });
  } catch (err) {
    sendInternalError(res, err, "[auth] listCriteriaSets");
  }
}

export async function saveCriteriaSet(req, res) {
  const parsed = saveCriteriaSetSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed);

  try {
    const set = await authService.saveCriteriaSet(req.userId, parsed.data);
    res.status(201).json({ success: true, data: set });
  } catch (err) {
    sendInternalError(res, err, "[auth] saveCriteriaSet");
  }
}

export async function deleteCriteriaSet(req, res) {
  try {
    const deleted = await authService.deleteCriteriaSet(req.userId, req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: { message: "Criteria set not found" } });
    }
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) {
    sendInternalError(res, err, "[auth] deleteCriteriaSet");
  }
}
