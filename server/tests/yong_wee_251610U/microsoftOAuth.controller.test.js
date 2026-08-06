/**
 * Owner: Yong Wee (Person 1) - Auth ("Sign in with Microsoft").
 * Unit tests for auth.controller.js's microsoftOAuthStart()/
 * microsoftOAuthCallback() - the CSRF state cookie round trip, the error
 * redirects (denied consent, state mismatch, missing code, failed code
 * exchange), and the happy path that issues a normal session cookie. The
 * Microsoft OAuth service and the user-persistence half of auth.service.js
 * are both mocked so these tests never call Microsoft or a real database.
 * Mirrors googleOAuth.controller.test.js.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/services/microsoftOAuth.service.js", () => ({
  generateOAuthState: vi.fn(),
  buildMicrosoftAuthUrl: vi.fn(),
  exchangeCodeForProfile: vi.fn(),
}));
vi.mock("../../src/services/auth.service.js", () => ({
  findOrCreateMicrosoftUser: vi.fn(),
  issueToken: vi.fn(),
}));

import * as microsoftOAuthService from "../../src/services/microsoftOAuth.service.js";
import * as authService from "../../src/services/auth.service.js";
import { microsoftOAuthStart, microsoftOAuthCallback } from "../../src/controllers/auth.controller.js";

function mockRes() {
  const res = {};
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  res.redirect = vi.fn().mockReturnValue(res);
  return res;
}

describe("auth.controller - microsoftOAuthStart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.OAUTH_SUCCESS_REDIRECT = "http://localhost:5173/";
  });

  afterEach(() => {
    delete process.env.OAUTH_SUCCESS_REDIRECT;
  });

  it("stashes a short-lived CSRF state cookie and redirects to Microsoft's consent screen", () => {
    microsoftOAuthService.generateOAuthState.mockReturnValue("state-123");
    microsoftOAuthService.buildMicrosoftAuthUrl.mockReturnValue(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?state=state-123"
    );
    const res = mockRes();

    microsoftOAuthStart({}, res);

    expect(res.cookie).toHaveBeenCalledWith(
      "ms_oauth_state",
      "state-123",
      expect.objectContaining({ httpOnly: true, sameSite: "lax" })
    );
    expect(microsoftOAuthService.buildMicrosoftAuthUrl).toHaveBeenCalledWith("state-123");
    expect(res.redirect).toHaveBeenCalledWith(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?state=state-123"
    );
  });

  it("redirects back to the login page with an error instead of crashing if Microsoft isn't configured", () => {
    microsoftOAuthService.generateOAuthState.mockImplementation(() => {
      throw new Error("MS_CLIENT_ID is not set.");
    });
    const res = mockRes();

    microsoftOAuthStart({}, res);

    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining("/login?oauth=error"));
  });
});

describe("auth.controller - microsoftOAuthCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.OAUTH_SUCCESS_REDIRECT = "http://localhost:5173/";
  });

  afterEach(() => {
    delete process.env.OAUTH_SUCCESS_REDIRECT;
  });

  it("redirects with an error when the user denied consent on Microsoft's side", async () => {
    const req = { query: { error: "access_denied" }, cookies: {} };
    const res = mockRes();

    await microsoftOAuthCallback(req, res);

    expect(res.redirect.mock.calls[0][0]).toContain("oauth=error");
    expect(res.redirect.mock.calls[0][0]).toContain("Microsoft+sign-in+was+cancelled");
    expect(microsoftOAuthService.exchangeCodeForProfile).not.toHaveBeenCalled();
  });

  it("redirects with an error when the returned state doesn't match the CSRF cookie", async () => {
    const req = { query: { code: "abc", state: "wrong" }, cookies: { ms_oauth_state: "expected" } };
    const res = mockRes();

    await microsoftOAuthCallback(req, res);

    expect(res.redirect.mock.calls[0][0]).toContain("session+expired");
    expect(microsoftOAuthService.exchangeCodeForProfile).not.toHaveBeenCalled();
  });

  it("redirects with an error when Microsoft's redirect is missing the authorization code", async () => {
    const req = { query: { state: "expected" }, cookies: { ms_oauth_state: "expected" } };
    const res = mockRes();

    await microsoftOAuthCallback(req, res);

    expect(res.redirect.mock.calls[0][0]).toContain("session+expired");
  });

  it("clears the state cookie on every callback, success or failure", async () => {
    const req = { query: { error: "access_denied" }, cookies: { ms_oauth_state: "expected" } };
    const res = mockRes();

    await microsoftOAuthCallback(req, res);

    expect(res.clearCookie).toHaveBeenCalledWith("ms_oauth_state");
  });

  it("on a valid code+state, exchanges the profile, finds/creates the user, and sets a session cookie", async () => {
    const req = { query: { code: "auth-code", state: "expected" }, cookies: { ms_oauth_state: "expected" } };
    const res = mockRes();
    microsoftOAuthService.exchangeCodeForProfile.mockResolvedValue({
      microsoftId: "ms-uid-1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      avatar: null,
    });
    authService.findOrCreateMicrosoftUser.mockResolvedValue({ id: "user-1", isActive: true });
    authService.issueToken.mockReturnValue("mock-session-jwt");

    await microsoftOAuthCallback(req, res);

    expect(microsoftOAuthService.exchangeCodeForProfile).toHaveBeenCalledWith("auth-code");
    expect(authService.findOrCreateMicrosoftUser).toHaveBeenCalledWith({
      microsoftId: "ms-uid-1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      avatar: null,
    });
    expect(res.cookie).toHaveBeenCalledWith("token", "mock-session-jwt", expect.objectContaining({ httpOnly: true }));
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining("oauth=success"));
  });

  it("redirects with an error (without creating/linking a user) when exchanging the code fails", async () => {
    const req = { query: { code: "auth-code", state: "expected" }, cookies: { ms_oauth_state: "expected" } };
    const res = mockRes();
    microsoftOAuthService.exchangeCodeForProfile.mockRejectedValue(
      new Error("Microsoft token exchange failed (400)")
    );

    await microsoftOAuthCallback(req, res);

    expect(res.redirect.mock.calls[0][0]).toContain("oauth=error");
    expect(authService.findOrCreateMicrosoftUser).not.toHaveBeenCalled();
  });
});
