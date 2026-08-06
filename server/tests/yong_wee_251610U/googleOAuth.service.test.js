/**
 * Owner: Yong Wee (Person 1) - Auth ("Sign in with Google").
 * Unit tests for googleOAuth.service.js - building the Google consent URL,
 * generating the CSRF state value, and exchanging an authorization code for
 * a verified profile. global.fetch is stubbed so these tests never call a
 * real Google endpoint.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateOAuthState,
  buildGoogleAuthUrl,
  exchangeCodeForProfile,
} from "../../src/services/googleOAuth.service.js";

function mockFetchSequence(...responses) {
  const fn = vi.fn();
  for (const body of responses) {
    fn.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body });
  }
  global.fetch = fn;
}

describe("googleOAuth.service", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:4000/api/auth/oauth/google/callback";
  });

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
    vi.unstubAllGlobals();
  });

  describe("generateOAuthState", () => {
    it("returns a non-empty, URL-safe value that differs on every call", () => {
      const a = generateOAuthState();
      const b = generateOAuthState();

      expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(a.length).toBeGreaterThan(16);
      expect(a).not.toBe(b);
    });
  });

  describe("buildGoogleAuthUrl", () => {
    it("points at Google's consent screen with the configured client id/redirect and the given state", () => {
      const url = new URL(buildGoogleAuthUrl("abc123"));

      expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
      expect(url.searchParams.get("client_id")).toBe("test-client-id");
      expect(url.searchParams.get("redirect_uri")).toBe(
        "http://localhost:4000/api/auth/oauth/google/callback"
      );
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("scope")).toBe("openid email profile");
      expect(url.searchParams.get("state")).toBe("abc123");
    });

    it("throws a clear error when GOOGLE_CLIENT_ID is not configured", () => {
      delete process.env.GOOGLE_CLIENT_ID;

      expect(() => buildGoogleAuthUrl("abc123")).toThrow(/GOOGLE_CLIENT_ID is not set/);
    });
  });

  describe("exchangeCodeForProfile", () => {
    it("exchanges the code for a token, then the token for a verified profile", async () => {
      mockFetchSequence(
        { access_token: "test-access-token" },
        {
          sub: "google-uid-1",
          email: "ada@example.com",
          email_verified: true,
          name: "Ada Lovelace",
          picture: "https://example.com/ada.jpg",
        }
      );

      const profile = await exchangeCodeForProfile("test-code");

      expect(profile).toEqual({
        googleId: "google-uid-1",
        email: "ada@example.com",
        name: "Ada Lovelace",
        avatar: "https://example.com/ada.jpg",
      });

      const [tokenUrl, tokenOptions] = global.fetch.mock.calls[0];
      expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
      const tokenBody = new URLSearchParams(tokenOptions.body);
      expect(tokenBody.get("code")).toBe("test-code");
      expect(tokenBody.get("client_secret")).toBe("test-client-secret");
      expect(tokenBody.get("grant_type")).toBe("authorization_code");

      const [profileUrl, profileOptions] = global.fetch.mock.calls[1];
      expect(profileUrl).toBe("https://www.googleapis.com/oauth2/v3/userinfo");
      expect(profileOptions.headers.Authorization).toBe("Bearer test-access-token");
    });

    it("lower-cases the email and falls back to email/null when name/picture are absent", async () => {
      mockFetchSequence(
        { access_token: "test-access-token" },
        { sub: "google-uid-2", email: "Bob@Example.com", email_verified: true }
      );

      const profile = await exchangeCodeForProfile("test-code");

      expect(profile.email).toBe("bob@example.com");
      expect(profile.name).toBe("Bob@Example.com");
      expect(profile.avatar).toBeNull();
    });

    it("rejects when the token exchange itself fails", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 400 });

      await expect(exchangeCodeForProfile("bad-code")).rejects.toThrow(/token exchange failed \(400\)/);
    });

    it("rejects when the userinfo fetch fails", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: "t" }) })
        .mockResolvedValueOnce({ ok: false, status: 401 });

      await expect(exchangeCodeForProfile("test-code")).rejects.toThrow(/profile fetch failed \(401\)/);
    });

    it("rejects a Google account with no verified email address", async () => {
      mockFetchSequence(
        { access_token: "test-access-token" },
        { sub: "google-uid-3", email: "unverified@example.com", email_verified: false }
      );

      await expect(exchangeCodeForProfile("test-code")).rejects.toThrow(/no verified email/);
    });
  });
});
