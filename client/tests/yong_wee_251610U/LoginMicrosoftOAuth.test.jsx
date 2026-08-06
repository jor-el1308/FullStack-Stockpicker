/**
 * Owner: Yong Wee (Person 1) - Auth ("Sign in with Microsoft").
 * Unit tests for the Microsoft OAuth pieces of the Login page
 * (client/src/pages/Login.jsx): the "Continue with Microsoft" button itself,
 * and the effect that picks up the ?oauth=success|error query string
 * Microsoft gets redirected back to after
 * server/src/controllers/auth.controller.js's microsoftOAuthCallback()
 * finishes. Since both OAuth providers share the same ?oauth=... contract
 * and the same effect in Login.jsx, this mirrors LoginGoogleOAuth.test.jsx
 * rather than duplicating every case - see that file for the ?oauth=success
 * routing-by-isActive cases and the already-logged-in case, which are
 * provider-agnostic and not repeated here. The API client and auth context
 * are both mocked so this never hits a real server.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Login from "../../src/pages/Login";
import { api } from "../../src/api/client";
import { useAuth } from "../../src/context/AuthContext";

vi.mock("../../src/api/client", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../../src/context/AuthContext", () => ({ useAuth: vi.fn() }));

function renderLogin(initialPath, { user = null } = {}) {
  const login = vi.fn();
  const logout = vi.fn();
  useAuth.mockReturnValue({ user, login, logout });

  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<div>SCREENER_PAGE</div>} />
        <Route path="/activate" element={<div>ACTIVATE_PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );

  return { login, logout };
}

describe("Login - Microsoft OAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a Microsoft sign-in link pointing at GET /api/auth/oauth/microsoft, next to the Google one", () => {
    renderLogin("/login");

    const microsoftLink = screen.getByRole("link", { name: /continue with microsoft/i });
    expect(microsoftLink).toHaveAttribute("href", "/api/auth/oauth/microsoft");
    expect(screen.getByRole("link", { name: /continue with google/i })).toBeInTheDocument();
  });

  it("on ?oauth=success, fetches the session user and routes an active account to the screener (same effect as a Google redirect)", async () => {
    api.get.mockResolvedValue({ id: "u1", name: "Ada", email: "ada@example.com", isActive: true });
    const { login } = renderLogin("/login?oauth=success");

    expect(await screen.findByText("SCREENER_PAGE")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/auth/me");
    expect(login).toHaveBeenCalledWith(expect.objectContaining({ id: "u1", isActive: true }));
  });

  it("shows the server's Microsoft-specific error message on ?oauth=error without calling GET /auth/me", async () => {
    renderLogin("/login?oauth=error&message=Microsoft+sign-in+was+cancelled");

    expect(await screen.findByText("Microsoft sign-in was cancelled")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });
});
