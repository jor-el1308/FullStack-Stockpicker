/**
 * Owner: Person 1 (Yong Wee) - Auth + AI Recommendation.
 *
 * After a user shortlists stocks from the screener, this sends them to a
 * Gemini model for qualitative analysis (recent context, growth outlook,
 * reasoning) - requirement doc section 6.
 *
 * Uses Google's free-tier Gemini API (see server/.env.example -
 * AI_RECOMMENDATION_API_KEY). Kept in its own service file, same pattern as
 * subscription.service.js's Stripe wrapper: lazy client init, a clear error
 * if the key is missing, and all "how do we talk to this external API"
 * logic contained here so the controller stays thin.
 */
import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-flash-latest";

// Model tiers selectable from Settings -> AI preferences (ai_preferences.ai_model_tier).
// Only "flash" is actually wired up to a live provider right now - the other
// two are placeholders (real model names, no API integration written yet) so
// the preference UI/DB/env plumbing exists ahead of those providers being
// implemented. See server/.env.example for the placeholder key names.
const MODEL_TIERS = {
    flash: { label: "Gemini Flash" },
    "gpt-4o-mini": { label: "GPT-4o mini", envKey: "OPENAI_API_KEY" },
    "claude-haiku": { label: "Claude Haiku", envKey: "ANTHROPIC_API_KEY" },
};

const PERSONAS = {
    balanced: "a balanced, even-handed financial analyst who weighs growth potential and risk equally",
    conservative:
        "a conservative, risk-averse financial analyst who prioritizes capital preservation and stability, and is quick to flag downside risk over growth potential",
    growth:
        "a growth-focused financial analyst who prioritizes revenue/earnings momentum and future upside, even where that comes with more volatility",
    income:
        "an income-focused financial analyst who prioritizes dividend yield and payout stability over capital growth",
};

/**
 * Thrown by getQualitativeAnalysis() when the caller's preferred model tier
 * isn't backed by a real provider integration yet (see MODEL_TIERS above) -
 * the controller maps this to a 400 (user-fixable: pick a different tier)
 * rather than a generic 500.
 */
export class ModelTierUnavailableError extends Error {}

function getClient() {
    const key = process.env.AI_RECOMMENDATION_API_KEY;
    if (!key) {
        throw new Error(
            "AI_RECOMMENDATION_API_KEY is not set - get a free key at https://aistudio.google.com/app/apikey " +
            "and add it to server/.env"
        );
    }
    return new GoogleGenAI({ apiKey: key });
}

/**
 * @param {Array<{exchangeCode: string, stockCode: string, stockName: string, values?: Record<string, number>}>} stocks
 * @param {{aiPersona?: string, aiDetailLevel?: string, customInstructions?: string}} [preferences]
 *   From ai_preferences (see aiPreferences.service.js) - steers the persona
 *   the write-up is framed as, how much detail to include, and any free-text
 *   instructions the user added on top. Falls back to the same defaults as
 *   the ai_preferences table (balanced/concise/none) when omitted.
 */
function buildPrompt(stocks, preferences = {}) {
    const { aiPersona = "balanced", aiDetailLevel = "concise", customInstructions = "" } = preferences;

    const list = stocks
        .map((s) => {
            const metrics = s.values
                ? Object.entries(s.values)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ")
                : "no screener metrics provided";
            return `- ${s.stockName} (${s.exchangeCode}:${s.stockCode}) — ${metrics}`;
        })
        .join("\n");

    const personaDescription = PERSONAS[aiPersona] ?? PERSONAS.balanced;
    const detailInstruction =
        aiDetailLevel === "detailed"
            ? "Be thorough: 5-7 sentences per stock, covering more nuance in your reasoning."
            : "Keep each stock's write-up to 3-4 sentences.";
    const customInstructionsBlock = customInstructions.trim()
        ? `\nThe user also gave these additional instructions - follow them as long as they don't conflict with anything above:\n${customInstructions.trim()}\n`
        : "";

    return `You are ${personaDescription}, helping a retail investor review a shortlist of stocks that just passed their screener criteria.

For EACH stock below, give a qualitative take covering:
1. Recent news / context you're aware of (if none, say so - don't invent facts)
2. Growth outlook (brief)
3. 1-2 sentences of reasoning tying it back to the screener metrics given, viewed through your persona's priorities above

${detailInstruction} End with a one-line disclaimer that this is not financial advice.
${customInstructionsBlock}
Respond in plain text only, no markdown or HTML. Do not use asterisks, underscores, backticks, or "#" headers for formatting. Use a stock's name followed by a colon to start each write-up, and a plain line breaks between stocks.

Shortlisted stocks:
${list}`;
}

/**
 * Safety net for when the model formats with markdown despite being asked
 * not to (Gemini does this fairly often, e.g. **bold** metric names or
 * "* " bullet lists). Strips the common markdown tokens while leaving the
 * words themselves intact, since the client renders this as plain
 * pre-wrapped text, not through a markdown renderer.
 * @param {string} text
 * @returns {string}
 */

function stripMarkdown(text) {
    return text
        // bold/italic: **text**, __text__, *text*, _text_ -> text
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/_(.+?)_/g, "$1")
        // inline code / code fences
        .replace(/```/g, "")
        .replace(/`(.+?)`/g, "$1")
        // heading markers at line start: "# ", "## ", etc.
        .replace(/^#{1,6}\s+/gm, "")
        // bullet markers at line start: "* ", "- ", "+ "
        .replace(/^[\s]*[*+-]\s+/gm, "")
        // any leftover stray asterisks/underscores used as emphasis
        .replace(/[*_]{1,3}/g, "")
        .trim();
}

/**
 * @param {Array<{exchangeCode: string, stockCode: string, stockName: string, values?: Record<string, number>}>} stocks
 * @param {{aiModelTier?: string, aiPersona?: string, aiDetailLevel?: string, customInstructions?: string}} [preferences]
 *   The caller's saved ai_preferences row (see aiPreferences.service.js).
 * @returns {Promise<string>} plain-text analysis
 */
export async function getQualitativeAnalysis(stocks, preferences = {}) {
    const { aiModelTier = "flash" } = preferences;
    const tier = MODEL_TIERS[aiModelTier] ?? MODEL_TIERS.flash;
    if (aiModelTier !== "flash") {
        throw new ModelTierUnavailableError(
            `${tier.label} isn't wired up yet - only Gemini Flash is implemented right now. ` +
            `Switch back to Gemini Flash in Settings -> AI preferences to run an analysis.`
        );
    }

    const client = getClient();
    const prompt = buildPrompt(stocks, preferences);

    const response = await client.models.generateContent({
        model: MODEL,
        contents: prompt,
    });

    const text = response.text;
    if (!text) {
        throw new Error("AI provider returned an empty response");
    }
    return stripMarkdown(text);
}