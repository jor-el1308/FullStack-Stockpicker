import rateLimit from "express-rate-limit";

/**
 * Owner: Person 1 (Auth & User Management) - security fix.
 *
 * Nothing in this app previously rate-limited login/signup/OTP, so an
 * attacker could brute-force a password or a 6-digit OTP (1,000,000
 * combinations) as fast as the network allowed. These limiters are scoped
 * per-IP and generous enough not to trip up normal use, but cap the request
 * rate a script can throw at these endpoints.
 */

// Password/credential guessing: keep this tight.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many attempts. Please try again later." } },
});

// OTP brute-force: a 6-digit code only has 1,000,000 possibilities, so this
// needs to be even stricter than the login limiter above.
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many attempts. Please try again later." } },
});

// Signup: looser than login (no secret to guess), just capping automated
// account creation.
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many accounts created from this network. Please try again later." } },
});
