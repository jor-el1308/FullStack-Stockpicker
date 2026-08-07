/**
 * Owner: Charles (Person 2) - Subscription/Paywall.
 * Component tests for the Activate (paywall) page. The API client and the
 * auth context are stubbed so each state is deterministic and no real
 * network call happens.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Activate from "../../src/pages/Activate";
import { api } from "../../src/api/client";
import { useAuth } from "../../src/context/AuthContext";

vi.mock("../../src/api/client", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../../src/context/AuthContext", () => ({ useAuth: vi.fn() }));

const authValue = { user: { name: "Charles", isActive: false }, updateUser: vi.fn(), logout: vi.fn() };

function renderAt(path = "/activate") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Activate />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue(authValue);
});

describe("Activate page", () => {
  it("shows the S$9.99/month fee and a subscribe button when logged in", () => {
    renderAt();
    expect(screen.getByText("Activate your account")).toBeInTheDocument();
    expect(screen.getAllByText(/S\$9\.99\/month/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Subscribe for S\$9\.99\/month/ })).toBeInTheDocument();
  });

  it("starts a Checkout session and redirects to Stripe on subscribe", async () => {
    // window.location.href assignment triggers a jsdom navigation that isn't
    // implemented, so swap in a writable stub we can assert against.
    const originalLocation = window.location;
    Object.defineProperty(window, "location", { writable: true, value: { href: "" } });
    api.post.mockResolvedValue({ url: "https://checkout.stripe.test/pay" });

    renderAt();
    fireEvent.click(screen.getByRole("button", { name: /Subscribe for/ }));

    expect(api.post).toHaveBeenCalledWith("/subscription/checkout-session");
    await waitFor(() => expect(window.location.href).toBe("https://checkout.stripe.test/pay"));

    Object.defineProperty(window, "location", { writable: true, value: originalLocation });
  });

  it("verifies the session and activates when returning from Stripe", async () => {
    api.get.mockResolvedValue({ isActive: true, activatedAt: "2026-08-07T00:00:00.000Z" });
    renderAt("/activate?session_id=cs_test_123&status=success");

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/subscription/verify-session?session_id=cs_test_123")
    );
    expect(authValue.updateUser).toHaveBeenCalledWith({
      isActive: true,
      activatedAt: "2026-08-07T00:00:00.000Z",
    });
  });

  it("shows a cancelled message when Stripe reports status=cancelled", () => {
    renderAt("/activate?status=cancelled");
    expect(screen.getByText(/Payment was cancelled/)).toBeInTheDocument();
  });

  it("renders nothing (redirects) when there is no logged-in user", () => {
    useAuth.mockReturnValue({ user: null, updateUser: vi.fn(), logout: vi.fn() });
    renderAt();
    expect(screen.queryByText("Activate your account")).not.toBeInTheDocument();
  });
});
