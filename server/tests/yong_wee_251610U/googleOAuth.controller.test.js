/**
 * Owner: Yong Wee (Person 1) - Auth ("Sign in with Google").
 * Unit tests for auth.controller.js's googleOAuthStart()/googleOAuthCallback() -
 * the CSRF state cookie round trip, the error redirects (denied consent,
 * state mismatch, missing code, failed code exchange), and the happy path
 * that issues a normal session cookie. The Google OAuth service and the
 * user-persistence half of auth.service.js are both mocked so these tests
 * never call Google or a real database.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/services/googleOAuth.service.js", () => ({
  generateOAuthState: vi.fn(),
  buildGoogleAuthUrl: vi.fn(),
  exchangeCodeForProfile: vi.fn(),
}));
vi.mock("../../src/services/auth.service.js", () => ({
  findOrCreateGoogleUser: vi.fn(),
  issueToken: vi.fn(),
}));

import * as googleOAuthService from "../../src/services/googleOAuth.service.js";
import * as authService from "../../src/services/auth.service.js";
import { googleOAuthStart, googleOAuthCallback } from "../../src/controllers/auth.controller.js";

function mockRes() {
  const res = {};
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  res.redirect = vi.fn().mockReturnValue(res);
  return res;
}

describe("auth.controller - googleOAuthStart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.OAUTH_SUCCESS_REDIRECT = "http://localhost:5173/";
  });

  afterEach(() => {
    delete process.env.OAUTH_SUCCESS_REDIRECT;
  });

  it("stashes a short-lived CSRF state cookie and redirects to Google's consent screen", () => {
    googleOAuthService.generateOAuthState.mockReturnValue("state-123");
    googleOAuthService.buildGoogleAuthUrl.mockReturnValue(
      "https://accounts.google.com/o/oauth2/v2/auth?state=state-123"
    );
    const res = mockRes();

    googleOAuthStart({}, res);

    expect(res.cookie).toHaveBeenCalledWith(
      "g_oauth_state",
      "state-123",
      expect.objectContaining({ httpOnly: true, sameSite: "lax" })
    );
    expect(googleOAuthService.buildGoogleAuthUrl).toHaveBeenCalledWith("state-123");
    expect(res.redirect).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?state=state-123");
  });

  it("redirects back to the login page with an error instead of crashing if Google isn't configured", () => {
    googleOAuthService.generateOAuthState.mockImplementation(() => {
      throw new Error("GOOGLE_CLIENT_ID is not set.");
    });
    const res = mockRes();

    googleOAuthStart({}, res);

    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining("/login?oauth=error"));
  });
});

describe("auth.controller - googleOAuthCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.OAUTH_SUCCESS_REDIRECT = "http://localhost:5173/";
  });

  afterEach(() => {
    delete process.env.OAUTH_SUCCESS_REDIRECT;
  });

  it("redirects with an error when the user denied consent on Google's side", async () => {
    const req = { query: { error: "access_denied" }, cookies: {} };
    const res = mockRes();

    await googleOAuthCallback(req, res);

    expect(res.redirect.mock.calls[0][0]).toContain("oauth=error");
    expect(res.redirect.mock.calls[0][0]).toContain("Google+sign-in+was+cancelled");
    expect(googleOAuthService.exchangeCodeForProfile).not.toHaveBeenCalled();
  });

  it("redirects with an error when the returned state doesn't match the CSRF cookie", async () => {
    const req = { query: { code: "abc", state: "wrong" }, cookies: { g_oauth_state: "expected" } };
    const res = mockRes();

    await googleOAuthCallback(req, res);

    expect(res.redirect.mock.calls[0][0]).toContain("session+expired");
    expect(googleOAuthService.exchangeCodeForProfile).not.toHaveBeenCalled();
  });

  it("redirects with an error when Google's redirect is missing the authorization code", async () => {
    const req = { query: { state: "expected" }, cookies: { g_oauth_state: "expected" } };
    const res = mockRes();

    await googleOAuthCallback(req, res);

    expect(res.redirect.mock.calls[0][0]).toContain("session+expired");
  });

  it("clears the state cookie on every callback, success or failure", async () => {
    const req = { query: { error: "access_denied" }, cookies: { g_oauth_state: "expected" } };
    const res = mockRes();

    await googleOAuthCallback(req, res);

    expect(res.clearCookie).toHaveBeenCalledWith("g_oauth_state");
  });

  it("on a valid code+state, exchanges the profile, finds/creates the user, and sets a session cookie", async () => {
    const req = { query: { code: "auth-code", state: "expected" }, cookies: { g_oauth_state: "expected" } };
    const res = mockRes();
    googleOAuthService.exchangeCodeForProfile.mockResolvedValue({
      googleId: "google-uid-1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      avatar: null,
    });
    authService.findOrCreateGoogleUser.mockResolvedValue({ id: "user-1", isActive: true });
    authService.issueToken.mockReturnValue("mock-session-jwt");

    await googleOAuthCallback(req, res);

    expect(googleOAuthService.exchangeCodeForProfile).toHaveBeenCalledWith("auth-code");
    expect(authService.findOrCreateGoogleUser).toHaveBeenCalledWith({
      googleId: "google-uid-1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      avatar: null,
    });
    expect(res.cookie).toHaveBeenCalledWith("token", "mock-session-jwt", expect.objectContaining({ httpOnly: true }));
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining("oauth=success"));
  });

  it("redirects with an error (without creating/linking a user) when exchanging the code fails", async () => {
    const req = { query: { code: "auth-code", state: "expected" }, cookies: { g_oauth_state: "expected" } };
    const res = mockRes();
    googleOAuthService.exchangeCodeForProfile.mockRejectedValue(new Error("Google token exchange failed (400)"));

    await googleOAuthCallback(req, res);

    expect(res.redirect.mock.calls[0][0]).toContain("oauth=error");
    expect(authService.findOrCreateGoogleUser).not.toHaveBeenCalled();
  });
});
