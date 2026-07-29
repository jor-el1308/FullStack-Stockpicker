import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Light/dark mode for the app shell. Persisted to localStorage and applied
 * as a `data-theme` attribute on <html>, which index.css keys off of to swap
 * the --color-bg/--color-surface/--color-text/etc. custom properties.
 */
const ThemeContext = createContext(null);

function readStoredTheme() {
  try {
    const stored = localStorage.getItem("theme");
    return stored === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // ignore (e.g. localStorage disabled)
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
