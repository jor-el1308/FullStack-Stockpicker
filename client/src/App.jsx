import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import Activate from "./pages/Activate";
import Screener from "./pages/Screener";
import Dashboard from "./pages/Dashboard";
import StockDetail from "./pages/StockDetail";
import Watchlist from "./pages/Watchlist";
import { colors } from "./theme";
import { AuthProvider, useAuth } from "./context/AuthContext";

function NavBar() {
  const { user } = useAuth();
  return (
    <nav
      style={{
        background: colors.darkMenu,
        color: "#fff",
        padding: "12px 24px",
        display: "flex",
        gap: 20,
        alignItems: "center",
      }}
    >
      <strong>Stock Screener</strong>
      <NavLink to="/" style={{ color: "#fff" }} end>
        Screener
      </NavLink>
      <NavLink to="/dashboard" style={{ color: "#fff" }}>
        Dashboard
      </NavLink>
      <NavLink to="/watchlist" style={{ color: "#fff" }}>
        Watchlist
      </NavLink>
      <NavLink to="/login" style={{ color: "#fff", marginLeft: "auto" }}>
        {user ? `Account (${user.name})` : "Login"}
      </NavLink>
    </nav>
  );
}

/**
 * Paywall route guard (Person 2 - Subscription/Paywall).
 * If a user is logged in but hasn't paid the activation fee yet
 * (user.isActive === false), every route except /activate and /login
 * redirects to /activate. Mirrors the server-side gate in
 * server/src/middleware/subscription.middleware.js - this is purely a UX
 * nicety (avoid flashing paywalled content); the API still enforces the
 * real gate independently.
 */
function RequireActive({ children }) {
  const { user } = useAuth();
  if (user && !user.isActive) {
    return <Navigate to="/activate" replace />;
  }
  return children;
}

function AppLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const isAuthScreen = pathname === "/login" && !user;
  const isActivateScreen = pathname === "/activate";

  return (
    <div style={{ minHeight: "100vh" }}>
      {!isAuthScreen && !isActivateScreen && <NavBar />}

      <main style={isAuthScreen || isActivateScreen ? undefined : { padding: 24 }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/activate" element={<Activate />} />
          <Route
            path="/"
            element={
              <RequireActive>
                <Screener />
              </RequireActive>
            }
          />
          <Route
            path="/dashboard"
            element={
              <RequireActive>
                <Dashboard />
              </RequireActive>
            }
          />
          <Route
            path="/stock/:exchangeCode/:stockCode"
            element={
              <RequireActive>
                <StockDetail />
              </RequireActive>
            }
          />
          <Route
            path="/watchlist"
            element={
              <RequireActive>
                <Watchlist />
              </RequireActive>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </AuthProvider>
  );
}
