// Shared option lists for the AI preferences feature - used by the "AI
// preferences" tab on the Settings page and by the floating AI button on
// the Screener page (which shows the active model/persona/detail level as
// a tooltip). All four model tiers route through OpenRouter under one API
// key (server/src/services/ai.service.js - OPENROUTER_API_KEY). Keep in
// sync with MODEL_TIERS in ai.service.js and AI_MODEL_TIERS in
// aiPreferences.service.js.
export const AI_MODEL_OPTIONS = [
  { id: "flash", label: "Gemini 2.5 Flash", description: "Google's Gemini model - fast and well-rounded. The default." },
  { id: "gpt-4o-mini", label: "GPT-4o mini", description: "OpenAI's lightweight GPT-4o model - quick, cost-efficient responses." },
  { id: "claude-haiku", label: "Claude Haiku 4.5", description: "Anthropic's fast Claude model - crisp, concise write-ups." },
  { id: "deepseek-chat", label: "DeepSeek Chat", description: "DeepSeek's general-purpose chat model - strong reasoning at low cost." },
];

export const AI_PERSONA_OPTIONS = [
  { id: "balanced", label: "Balanced", description: "Weighs growth potential and risk evenly - a neutral, well-rounded take on each stock." },
  { id: "conservative", label: "Conservative", description: "Prioritizes stability and capital preservation, quick to flag downside risk over growth potential." },
  { id: "growth", label: "Growth", description: "Focuses on momentum and future upside, even where that means more volatility." },
  { id: "income", label: "Income & dividends", description: "Emphasizes dividend yield and payout stability over capital growth." },
];

export const AI_DETAIL_OPTIONS = [
  { id: "concise", label: "Concise", description: "Short, to-the-point write-ups (3-4 sentences per stock)." },
  { id: "detailed", label: "Detailed", description: "Longer write-ups with extra nuance and reasoning (5-7 sentences per stock)." },
];

export const CUSTOM_INSTRUCTIONS_MAX = 1000;
