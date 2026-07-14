import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api/client";

/**
 * Owner: Person 1 (Yong Wee) - Auth & User Management.
 * Shares the logged-in user across the app (nav bar, Login/account page, etc.)
 *
 * NOTE for Person 1 (added by Person 2 for the subscription/paywall feature -
 * please review): user objects now carry `isActive`/`activatedAt` (see
 * auth.controller.js's toAuthUser()). Added updateUser() below so the new
 * Activate.jsx page can flip isActive to true right after a successful
 * (mock) payment, without needing to re-issue a token through login().
 *
 * NOTE for Person 1 (added by Person 2 - security fix, please review): the
 * session token itself now lives in an httpOnly cookie set by the server
 * (see auth.controller.js / client/src/api/client.js) instead of
 * localStorage, so this context no longer stores or reads a token at all.
 * `user` is still cached in localStorage purely so the UI doesn't flash
 * "logged out" on refresh, but it's treated as a hint, not a source of
 * truth: the mount effect below always re-validates it against
 * GET /api/auth/me (which relies on the cookie), and clears it if that
 * fails (e.g. the cookie expired or was cleared).
 */
const AuthContext = createContext(null);

function readStoredUser() {
  try {
    const raw = localStorage.getItem("authUser");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);

  const login = useCallback((nextUser) => {
    localStorage.setItem("authUser", JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("authUser");
    setUser(null);
    api.post("/auth/logout").catch(() => {}); // best-effort - clears the httpOnly cookie server-side
  }, []);

  // Merges a partial update (e.g. { isActive: true, activatedAt } after
  // paying) into the current user.
  const updateUser = useCallback((patch) => {
    setUser((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      localStorage.setItem("authUser", JSON.stringify(next));
      return next;
    });
  }, []);

  // Re-validate the cached user against the server's cookie-backed session
  // on mount, so a stale/expired cookie (e.g. after JWT_SECRET rotates, or
  // the cookie was manually cleared) doesn't leave the UI showing a "logged
  // in" state the API will actually reject.
  useEffect(() => {
    if (!readStoredUser()) return;
    api
      .get("/auth/me")
      .then((freshUser) => {
        localStorage.setItem("authUser", JSON.stringify(freshUser));
        setUser(freshUser);
      })
      .catch(() => {
        localStorage.removeItem("authUser");
        setUser(null);
      });
  }, []);

  return <AuthContext.Provider value={{ user, login, logout, updateUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
