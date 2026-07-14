import { z } from "zod";
import * as authService from "../services/auth.service.js";
import { sendOtpEmail } from "../utils/mailer.js";
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
