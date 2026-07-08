import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import Login from "./pages/Login";
import Activate from "./pages/Activate";
import Screener from "./pages/Screener";
import AdvancedFilters from "./pages/AdvancedFilters";
import SavedScreens from "./pages/SavedScreens";
import Dashboard from "./pages/Dashboard";
import StockDetail from "./pages/StockDetail";
import Watchlist from "./pages/Watchlist";
import Admin from "./pages/Admin";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ScreenerProvider } from "./context/ScreenerContext";

function sidebarLinkClass({ isActive }) {
  return "app-sidebar-link" + (isActive ? " active" : "");
}

/**
 * Left sidebar nav - replaces the old top NavBar. Styled to match the dark
 * sidebar on the login page (client/src/pages/Login.jsx / .auth-dark-*
 * classes in index.css) so the app feels consistent before and after
 * logging in. Icons are Bootstrap Icons (bootstrap-icons package, loaded
 * as a webfont in main.jsx) - class names are "bi bi-<icon-name>".
 *
 * Nav items are grouped under section labels (Screening / Portfolio /
 * Admin), mirroring the grouped-sidebar format from the reference design.
 * The account menu lives in the top bar now, not here - see TopBar() below.
 */
function Sidebar() {
  const { user } = useAuth();

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar-logo">
        <span className="app-sidebar-logo-mark">SS</span>
        <span className="app-sidebar-logo-text">Stock Screener</span>
      </div>

      <nav className="app-sidebar-nav">
        <div className="app-sidebar-group">
          <div className="app-sidebar-group-label">Screening</div>
          <NavLink to="/" end className={sidebarLinkClass}>
            <i className="bi bi-funnel" />
            <span>Screener</span>
          </NavLink>
          <NavLink to="/filters" className={sidebarLinkClass}>
            <i className="bi bi-sliders" />
            <span>Advanced Filters</span>
          </NavLink>
          <NavLink to="/saved" className={sidebarLinkClass}>
            <i className="bi bi-bookmark" />
            <span>Saved Screens</span>
          </NavLink>
        </div>

        <div className="app-sidebar-group">
          <div className="app-sidebar-group-label">Portfolio</div>
          <NavLink to="/dashboard" className={sidebarLinkClass}>
            <i className="bi bi-speedometer2" />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/watchlist" className={sidebarLinkClass}>
            <i className="bi bi-eye" />
            <span>Watchlist</span>
          </NavLink>
        </div>

        {user?.isAdmin && (
          <div className="app-sidebar-group">
            <div className="app-sidebar-group-label">Admin</div>
            <NavLink to="/admin" className={sidebarLinkClass}>
              <i className="bi bi-shield-lock" />
              <span>Admin</span>
            </NavLink>
          </div>
        )}
      </nav>
    </aside>
  );
}

/**
 * Top bar - sits above the routed page content, right-aligned account menu
 * (mirrors the top-right avatar + dropdown pattern from the reference
 * design). The dropdown only shows real account info/actions (name, email,
 * an Active/Admin status badge, Log out) - no placeholder rows for features
 * like Currency/Language/Dark Theme that don't exist in this app yet.
 */
function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const initials = user?.name
    ? user.name
        .trim()
        .split(/\s+/)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  return (
    <header className="app-topbar">
      {user ? (
        <div className="user-menu">
          <button type="button" className="user-menu-trigger">
            <span className="user-menu-avatar">{initials}</span>
            <i className="bi bi-chevron-down" />
          </button>
          <div className="user-menu-dropdown">
            <div className="user-menu-header">
              <span className="user-menu-avatar-lg">{initials}</span>
              <div style={{ minWidth: 0 }}>
                <div className="user-menu-name-row">
                  <span className="user-menu-name">{user.name}</span>
                  {user.isAdmin ? (
                    <span className="user-menu-badge admin">Admin</span>
                  ) : user.isActive ? (
                    <span className="user-menu-badge active">Active</span>
                  ) : null}
                </div>
                <div className="user-menu-email">{user.email}</div>
              </div>
            </div>
            <div className="user-menu-divider" />
            <button type="button" onClick={handleLogout} className="user-menu-logout">
              <i className="bi bi-box-arrow-right" />
              Log out
            </button>
          </div>
        </div>
      ) : (
        <NavLink to="/login" className="app-topbar-login">
          <i className="bi bi-box-arrow-in-right" />
          <span>Log in</span>
        </NavLink>
      )}
    </header>
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

/**
 * Admin route guard (Person 2 - Admin Dashboard).
 * Non-admins (or logged-out users) get bounced to the screener instead of
 * seeing the admin page. Mirrors the server-side requireAdmin middleware -
 * a UX nicety, not the real security boundary (the API enforces that).
 */
function RequireAdmin({ children }) {
  const { user } = useAuth();
  if (!user || !user.isAdmin) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function AppLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const isAuthScreen = pathname === "/login" && !user;
  const isActivateScreen = pathname === "/activate";
  const showSidebar = !isAuthScreen && !isActivateScreen;

  const routes = (
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
        path="/filters"
        element={
          <RequireActive>
            <AdvancedFilters />
          </RequireActive>
        }
      />
      <Route
        path="/saved"
        element={
          <RequireActive>
            <SavedScreens />
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
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <Admin />
          </RequireAdmin>
        }
      />
    </Routes>
  );

  if (!showSidebar) {
    // Login (logged-out) and Activate render full-bleed with no sidebar,
    // same as before - they have their own dark-page layout.
    return <main>{routes}</main>;
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-content">
        <TopBar />
        <main className="app-main">{routes}</main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ScreenerProvider>
        <BrowserRouter>
          <AppLayout />
        </BrowserRouter>
      </ScreenerProvider>
    </AuthProvider>
  );
}
