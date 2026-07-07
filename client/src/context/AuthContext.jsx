import { createContext, useCallback, useContext, useState } from "react";

/**
 * Owner: Person 1 (Yong Wee) - Auth & User Management.
 * Shares the logged-in user across the app (nav bar, Login/account page, etc.)
 * and keeps localStorage (read by client/src/api/client.js) in sync.
 *
 * NOTE for Person 1 (added by Person 2 for the subscription/paywall feature -
 * please review): user objects now carry `isActive`/`activatedAt` (see
 * auth.controller.js's toAuthUser()). Added updateUser() below so the new
 * Activate.jsx page can flip isActive to true right after a successful
 * (mock) payment, without needing to re-issue a token through login().
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

  const login = useCallback((nextUser, token) => {
    localStorage.setItem("authToken", token);
    localStorage.setItem("authUser", JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("authUser");
    setUser(null);
  }, []);

  // Merges a partial update (e.g. { isActive: true, activatedAt } after
  // paying) into the current user without touching the stored auth token.
  const updateUser = useCallback((patch) => {
    setUser((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      localStorage.setItem("authUser", JSON.stringify(next));
      return next;
    });
  }, []);

  return <AuthContext.Provider value={{ user, login, logout, updateUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
