/**
 * Design tokens from the company style guide (Full Stack.pdf, "Themes" page).
 * Import these instead of hardcoding colors/fonts anywhere in the app.
 */
export const colors = {
  // darkMenu doubles as "primary text color" throughout the app (see
  // pages that import it) - it tracks the light/dark theme via the
  // --color-text custom property (see index.css). For an always-dark
  // surface (e.g. a fixed dark panel), use "var(--color-dark-menu)"
  // directly instead - that token does NOT change with the theme.
  darkMenu: "var(--color-text)",
  lightBackground: "var(--color-bg)", // Page/section background - theme-aware
  surface: "var(--color-surface)", // Card/input/button surface background - theme-aware
  clickable: "#1A5C9E", // Clickable things - use for FILLS (button/badge backgrounds)
  // Same accent, re-tuned per theme for use as TEXT (links, icon buttons).
  // The flat #1A5C9E only reaches ~2.4:1 on the dark theme's surface, which
  // is what made links and secondary buttons hard to read in dark mode.
  link: "var(--color-link)",
  goodNumber: "#00A86B", // Positive/good numbers (e.g. price up, good financials)
  badNumber: "#D16B6B", // Negative/bad numbers
  special: "#C9A84C", // Special features / highlights
  border: "var(--color-border)", // Neutral border - theme-aware
  mutedText: "var(--color-muted-text)", // Secondary text - theme-aware
};

export const fonts = {
  titleLabel: "'Inter', sans-serif", // Titles & Labels -> Inter Semi-bold
  description: "'Inter', sans-serif", // Descriptions & Filters -> Inter Regular
  numeric: "'Roboto Mono', monospace", // All numbers/prices/financial data
};

export const fontWeights = {
  titleLabel: 600,
  description: 400,
  numeric: 400,
};
