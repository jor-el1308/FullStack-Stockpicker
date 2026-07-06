import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Login from "./pages/Login";
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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div style={{ minHeight: "100vh" }}>
          <NavBar />

          <main style={{ padding: 24 }}>
            <Routes>
              <Route path="/" element={<Screener />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/stock/:exchangeCode/:stockCode" element={<StockDetail />} />
              <Route path="/watchlist" element={<Watchlist />} />
              <Route path="/login" element={<Login />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
