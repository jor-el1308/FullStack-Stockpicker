/**
 * Design tokens from the company style guide (Full Stack.pdf, "Themes" page).
 * Import these instead of hardcoding colors/fonts anywhere in the app.
 */
export const colors = {
  darkMenu: "#0A1628", // Dark areas (menus)
  lightBackground: "#F4F7FC", // Light areas (backgrounds)
  clickable: "#1A5C9E", // Clickable things (links, buttons)
  goodNumber: "#00A86B", // Positive/good numbers (e.g. price up, good financials)
  badNumber: "#D16B6B", // Negative/bad numbers
  special: "#C9A84C", // Special features / highlights
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
