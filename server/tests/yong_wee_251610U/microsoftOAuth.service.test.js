/**
 * Owner: Yong Wee (Person 1) - Auth ("Sign in with Microsoft").
 * Unit tests for microsoftOAuth.service.js - building the Microsoft consent
 * URL, generating the CSRF state value, and exchanging an authorization code
 * for a verified profile via Microsoft Graph. global.fetch is stubbed so
 * these tests never call a real Microsoft endpoint. Mirrors
 * googleOAuth.service.test.js.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateOAuthState,
  buildMicrosoftAuthUrl,
  exchangeCodeForProfile,
} from "../../src/services/microsoftOAuth.service.js";

function mockFetchSequence(...responses) {
  const fn = vi.fn();
  for (const body of responses) {
    fn.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body });
  }
  global.fetch = fn;
}

describe("microsoftOAuth.service", () => {
  beforeEach(() => {
    process.env.MS_CLIENT_ID = "test-client-id";
    process.env.MS_CLIENT_SECRET = "test-client-secret";
    process.env.MS_REDIRECT_URI = "http://localhost:4000/api/auth/oauth/microsoft/callback";
    process.env.MS_TENANT_ID = "common";
  });

  afterEach(() => {
    delete process.env.MS_CLIENT_ID;
    delete process.env.MS_CLIENT_SECRET;
    delete process.env.MS_REDIRECT_URI;
    delete process.env.MS_TENANT_ID;
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

  describe("buildMicrosoftAuthUrl", () => {
    it("points at Microsoft's consent screen (under the configured tenant) with the configured client id/redirect and the given state", () => {
      const url = new URL(buildMicrosoftAuthUrl("abc123"));

      expect(url.origin + url.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
      expect(url.searchParams.get("client_id")).toBe("test-client-id");
      expect(url.searchParams.get("redirect_uri")).toBe(
        "http://localhost:4000/api/auth/oauth/microsoft/callback"
      );
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("scope")).toBe("openid email profile User.Read");
      expect(url.searchParams.get("state")).toBe("abc123");
    });

    it("uses a specific tenant id in the URL when MS_TENANT_ID is set", () => {
      process.env.MS_TENANT_ID = "contoso-tenant-id";

      const url = new URL(buildMicrosoftAuthUrl("abc123"));

      expect(url.origin + url.pathname).toBe(
        "https://login.microsoftonline.com/contoso-tenant-id/oauth2/v2.0/authorize"
      );
    });

    it("throws a clear error when MS_CLIENT_ID is not configured", () => {
      delete process.env.MS_CLIENT_ID;

      expect(() => buildMicrosoftAuthUrl("abc123")).toThrow(/MS_CLIENT_ID is not set/);
    });
  });

  describe("exchangeCodeForProfile", () => {
    it("exchanges the code for a token, then the token for a verified profile via Microsoft Graph", async () => {
      mockFetchSequence(
        { access_token: "test-access-token" },
        {
          id: "ms-uid-1",
          mail: "ada@example.com",
          userPrincipalName: "ada@example.com",
          displayName: "Ada Lovelace",
        }
      );

      const profile = await exchangeCodeForProfile("test-code");

      expect(profile).toEqual({
        microsoftId: "ms-uid-1",
        email: "ada@example.com",
        name: "Ada Lovelace",
        avatar: null,
      });

      const [tokenUrl, tokenOptions] = global.fetch.mock.calls[0];
      expect(tokenUrl).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/token");
      const tokenBody = new URLSearchParams(tokenOptions.body);
      expect(tokenBody.get("code")).toBe("test-code");
      expect(tokenBody.get("client_secret")).toBe("test-client-secret");
      expect(tokenBody.get("grant_type")).toBe("authorization_code");

      const [profileUrl, profileOptions] = global.fetch.mock.calls[1];
      expect(profileUrl).toBe("https://graph.microsoft.com/v1.0/me");
      expect(profileOptions.headers.Authorization).toBe("Bearer test-access-token");
    });

    it("lower-cases the email, falls back to userPrincipalName when mail is absent, and falls back name to email when displayName is absent", async () => {
      mockFetchSequence(
        { access_token: "test-access-token" },
        { id: "ms-uid-2", mail: null, userPrincipalName: "Bob@Example.com" }
      );

      const profile = await exchangeCodeForProfile("test-code");

      expect(profile.email).toBe("bob@example.com");
      // Falls back to the pre-lowercased email, same as googleOAuth.service.js's
      // `name: profile.name || profile.email` (not `profile.email.toLowerCase()`).
      expect(profile.name).toBe("Bob@Example.com");
      expect(profile.avatar).toBeNull();
    });

    it("rejects when the token exchange itself fails", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 400 });

      await expect(exchangeCodeForProfile("bad-code")).rejects.toThrow(/token exchange failed \(400\)/);
    });

    it("rejects when the Graph profile fetch fails", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: "t" }) })
        .mockResolvedValueOnce({ ok: false, status: 401 });

      await expect(exchangeCodeForProfile("test-code")).rejects.toThrow(/profile fetch failed \(401\)/);
    });

    it("rejects a Microsoft account with neither mail nor userPrincipalName", async () => {
      mockFetchSequence(
        { access_token: "test-access-token" },
        { id: "ms-uid-3", mail: null, userPrincipalName: null }
      );

      await expect(exchangeCodeForProfile("test-code")).rejects.toThrow(/no usable email/);
    });
  });
});
