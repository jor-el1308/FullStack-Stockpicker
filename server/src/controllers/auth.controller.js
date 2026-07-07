import { z } from "zod";
import * as authService from "../services/auth.service.js";

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

const criteriaRangeSchema = z
  .object({
    key: z.string().min(1),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .refine((range) => range.min !== undefined || range.max !== undefined, {
    message: "Each criteria range needs a min and/or max value",
  });

const saveCriteriaSetSchema = z.object({
  name: z.string().min(1).max(128),
  criteria: z.array(criteriaRangeSchema).min(1),
});

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
    res.status(201).json({ success: true, data: { user: toAuthUser(user), token } });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ success: false, error: { message: "An account with this email already exists" } });
    }
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}

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

    const token = authService.issueToken(user);
    res.json({ success: true, data: { user: toAuthUser(user), token } });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
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
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}

export async function listCriteriaSets(req, res) {
  try {
    const sets = await authService.listCriteriaSets(req.userId);
    res.json({ success: true, data: sets });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}

export async function saveCriteriaSet(req, res) {
  const parsed = saveCriteriaSetSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed);

  try {
    const set = await authService.saveCriteriaSet(req.userId, parsed.data);
    res.status(201).json({ success: true, data: set });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}
