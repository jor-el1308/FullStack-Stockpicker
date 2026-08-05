/**
 * Owner: Yong Wee (Person 1) - Auth ("Sign in with Google").
 * Unit tests for the Google OAuth pieces of the Login page
 * (client/src/pages/Login.jsx): the "Continue with Google" button itself,
 * and the effect that picks up the ?oauth=success|error query string Google
 * gets redirected back to after server/src/controllers/auth.controller.js's
 * googleOAuthCallback() finishes. The API client and auth context are both
 * mocked so this never hits a real server.
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

describe("Login - Google OAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a Google sign-in link pointing at GET /api/auth/oauth/google", () => {
    renderLogin("/login");

    const googleLink = screen.getByRole("link", { name: /continue with google/i });
    expect(googleLink).toHaveAttribute("href", "/api/auth/oauth/google");
  });

  it("on ?oauth=success, fetches the session user and routes an active account to the screener", async () => {
    api.get.mockResolvedValue({ id: "u1", name: "Ada", email: "ada@example.com", isActive: true });
    const { login } = renderLogin("/login?oauth=success");

    expect(await screen.findByText("SCREENER_PAGE")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/auth/me");
    expect(login).toHaveBeenCalledWith(expect.objectContaining({ id: "u1", isActive: true }));
  });

  it("on ?oauth=success, routes an unpaid account to /activate instead of the screener", async () => {
    api.get.mockResolvedValue({ id: "u1", name: "Ada", email: "ada@example.com", isActive: false });
    renderLogin("/login?oauth=success");

    expect(await screen.findByText("ACTIVATE_PAGE")).toBeInTheDocument();
  });

  it("shows an inline error and never logs in if GET /auth/me fails after a Google redirect", async () => {
    api.get.mockRejectedValue(new Error("session lookup failed"));
    const { login } = renderLogin("/login?oauth=success");

    expect(await screen.findByText(/google sign-in failed/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("shows the server's error message on ?oauth=error without calling GET /auth/me", async () => {
    renderLogin("/login?oauth=error&message=Google+sign-in+was+cancelled");

    expect(await screen.findByText("Google sign-in was cancelled")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("shows the account panel instead of the form/button when already logged in", () => {
    renderLogin("/login", { user: { id: "u1", name: "Ada", email: "ada@example.com", isActive: true } });

    expect(screen.getByText(/my account/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /continue with google/i })).not.toBeInTheDocument();
  });
});
