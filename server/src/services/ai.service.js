/**
 * Owner: Person 1 (Yong Wee) - Auth + AI Recommendation.
 *
 * After a user shortlists stocks from the screener, this sends them to an
 * LLM for qualitative analysis (recent context, growth outlook, reasoning)
 * - requirement doc section 6. A single stock gets a free-text write-up;
 * two or more stocks get a structured, head-to-head comparison (JSON) so the
 * client can render an actual comparison table instead of the model just
 * analyzing each stock on its own.
 *
 * The default tier (Gemini Flash) calls Google's Generative Language API
 * directly with AI_RECOMMENDATION_API_KEY - this is the one kept "live"
 * during development since it has a real free tier with no credit card.
 * The other three tiers (GPT-4o mini, Claude Haiku, DeepSeek) route through
 * OpenRouter (https://openrouter.ai) under one OPENROUTER_API_KEY, ready to
 * go once that account has credits. See server/.env.example for both keys.
 * Kept in its own service file, same pattern as subscription.service.js's
 * Stripe wrapper: lazy key lookup, a clear error if a key is missing, and
 * all "how do we talk to this external API" logic contained here so the
 * controller stays thin.
 */
const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Model tiers selectable from Settings -> AI preferences (ai_preferences.ai_model_tier).
// "flash" is called directly against Google's API (provider: "gemini");
// everything else routes through OpenRouter (provider: "openrouter"), so any
// model OpenRouter carries can be added here without touching the client/DB
// layer. Keys stay as they were before the OpenRouter migration ("flash"
// etc.) so existing saved preferences and the ai_preferences.ai_model_tier
// DB default keep working. See https://openrouter.ai/models for the full
// OpenRouter catalogue/slug format.
const MODEL_TIERS = {
    flash: { label: "Gemini 2.5 Flash", provider: "gemini", model: GEMINI_MODEL },
    "gpt-4o-mini": { label: "GPT-4o mini", provider: "openrouter", model: "openai/gpt-4o-mini" },
    "claude-haiku": { label: "Claude Haiku 4.5", provider: "openrouter", model: "anthropic/claude-haiku-4.5" },
    "deepseek-chat": { label: "DeepSeek Chat", provider: "openrouter", model: "deepseek/deepseek-chat" },
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

function getGeminiApiKey() {
    const key = process.env.AI_RECOMMENDATION_API_KEY;
    if (!key) {
        throw new Error(
            "AI_RECOMMENDATION_API_KEY is not set - get a free key at https://aistudio.google.com/app/apikey " +
            "and add it to server/.env"
        );
    }
    return key;
}

function getOpenRouterApiKey() {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
        throw new Error(
            "OPENROUTER_API_KEY is not set - get a free key at https://openrouter.ai/keys " +
            "and add it to server/.env"
        );
    }
    return key;
}

/**
 * "- Name (EXCH:CODE) — metric: value, ..." per stock, shared by both the
 * single-stock and comparison prompts.
 * @param {Array<{exchangeCode: string, stockCode: string, stockName: string, values?: Record<string, number>}>} stocks
 */
function formatStockList(stocks) {
    return stocks
        .map((s) => {
            const metrics = s.values
                ? Object.entries(s.values)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ")
                : "no screener metrics provided";
            return `- ${s.stockName} (${s.exchangeCode}:${s.stockCode}) — ${metrics}`;
        })
        .join("\n");
}

/**
 * Resolves the persona/detail/custom-instructions preferences shared by both
 * prompt templates. `detailInstructions` gives the concise/detailed wording
 * per mode, since "3-4 sentences per stock" doesn't make sense for a
 * comparison prompt's per-criterion notes.
 * @param {{aiPersona?: string, aiDetailLevel?: string, customInstructions?: string}} preferences
 * @param {{concise: string, detailed: string}} detailInstructions
 */
function resolvePreferences(preferences, detailInstructions) {
    const { aiPersona = "balanced", aiDetailLevel = "concise", customInstructions = "" } = preferences;

    const personaDescription = PERSONAS[aiPersona] ?? PERSONAS.balanced;
    const detailInstruction = aiDetailLevel === "detailed" ? detailInstructions.detailed : detailInstructions.concise;
    const customInstructionsBlock = customInstructions.trim()
        ? `\nThe user also gave these additional instructions - follow them as long as they don't conflict with anything above:\n${customInstructions.trim()}\n`
        : "";

    return { personaDescription, detailInstruction, customInstructionsBlock };
}

/**
 * Prompt for a single shortlisted stock - a free-text qualitative write-up.
 * @param {Array<{exchangeCode: string, stockCode: string, stockName: string, values?: Record<string, number>}>} stocks
 * @param {{aiPersona?: string, aiDetailLevel?: string, customInstructions?: string}} [preferences]
 *   From ai_preferences (see aiPreferences.service.js) - steers the persona
 *   the write-up is framed as, how much detail to include, and any free-text
 *   instructions the user added on top. Falls back to the same defaults as
 *   the ai_preferences table (balanced/concise/none) when omitted.
 */
function buildSingleStockPrompt(stocks, preferences = {}) {
    const { personaDescription, detailInstruction, customInstructionsBlock } = resolvePreferences(preferences, {
        concise: "Keep the write-up to 3-4 sentences.",
        detailed: "Be thorough: 5-7 sentences, covering more nuance in your reasoning.",
    });

    return `You are ${personaDescription}, helping a retail investor review a stock that just passed their screener criteria.

Give a qualitative take covering:
1. Recent news / context you're aware of (if none, say so - don't invent facts)
2. Growth outlook (brief)
3. 1-2 sentences of reasoning tying it back to the screener metrics given, viewed through your persona's priorities above

${detailInstruction} End with a one-line disclaimer that this is not financial advice.
${customInstructionsBlock}
Respond in plain text only, no markdown or HTML. Do not use asterisks, underscores, backticks, or "#" headers for formatting. Start with the stock's name followed by a colon.

Shortlisted stock:
${formatStockList(stocks)}`;
}

/**
 * Prompt for two or more shortlisted stocks - a structured, head-to-head
 * comparison instead of independent per-stock write-ups. Asks for strict
 * JSON so the client can render an actual comparison table (see
 * parseComparisonResponse below).
 * @param {Array<{exchangeCode: string, stockCode: string, stockName: string, values?: Record<string, number>}>} stocks
 * @param {{aiPersona?: string, aiDetailLevel?: string, customInstructions?: string}} [preferences]
 */
function buildComparisonPrompt(stocks, preferences = {}) {
    const { personaDescription, detailInstruction, customInstructionsBlock } = resolvePreferences(preferences, {
        concise: "Cover 4-5 comparison criteria, with one concise sentence per stock in each note.",
        detailed: "Cover 6-8 comparison criteria, with 1-2 sentences of nuance per stock in each note.",
    });
    const names = stocks.map((s) => s.stockName);

    return `You are ${personaDescription}, helping a retail investor directly compare a shortlist of stocks that just passed their screener criteria, side by side.

Do not analyze each stock in isolation - every criterion must be a head-to-head comparison across ALL of the stocks below, tying back to the screener metrics given where relevant, and you must pick a winner for each criterion (or "Tie" if genuinely even), viewed through your persona's priorities above.

${detailInstruction}
${customInstructionsBlock}
Respond with ONLY a single JSON object - no markdown code fences, no commentary before or after it - matching exactly this shape:
{
  "stocks": [${names.map((n) => JSON.stringify(n)).join(", ")}],
  "criteria": [
    { "name": "<criterion name>", "notes": ["<note for ${names[0]}>", "...one note per stock, same order as \\"stocks\\""], "winner": "<one of the stock names above, or \\"Tie\\">" }
  ],
  "summary": "<2-3 sentence overall take on which stock best fits the persona's priorities>",
  "disclaimer": "This is not financial advice."
}

Shortlisted stocks:
${formatStockList(stocks)}`;
}

/**
 * Safety net for when the model formats with markdown despite being asked
 * not to (Gemini does this fairly often, e.g. **bold** metric names or
 * "* " bullet lists). Strips the common markdown tokens while leaving the
 * words themselves intact, since the client renders this as plain
 * pre-wrapped text, not through a markdown renderer. Only used for the
 * free-text single-stock response - the comparison response is parsed as
 * JSON instead.
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
 * Pulls the JSON object out of a comparison response and validates its
 * shape. Slices between the first "{" and last "}" rather than
 * `JSON.parse`-ing the whole string, since models sometimes wrap the object
 * in a code fence or a stray sentence despite being told not to.
 * @param {string} text
 * @returns {{stocks: string[], criteria: Array<{name: string, notes: string[], winner: string}>, summary?: string, disclaimer?: string}}
 */
function parseComparisonResponse(text) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) {
        throw new Error("AI comparison response was not valid JSON");
    }

    let parsed;
    try {
        parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
        throw new Error("Could not parse AI comparison response as JSON");
    }

    if (!Array.isArray(parsed.stocks) || !Array.isArray(parsed.criteria)) {
        throw new Error("AI comparison response was missing the expected stocks/criteria fields");
    }
    return parsed;
}

/**
 * Direct call to Google's Generative Language API (no OpenRouter, no
 * credits needed - the free tier is enough for dev/demo use).
 * @returns {Promise<string>}
 */
async function callGemini(prompt) {
    const apiKey = getGeminiApiKey();

    const response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Gemini request failed (${response.status}): ${detail}`);
    }

    const data = await response.json();
    return (data?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

/**
 * Call one of the non-Gemini tiers via OpenRouter's OpenAI-compatible
 * /chat/completions endpoint.
 * @param {{label: string, model: string}} tier
 * @returns {Promise<string>}
 */
async function callOpenRouter(tier, prompt) {
    const apiKey = getOpenRouterApiKey();

    const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            // OpenRouter uses these to attribute/rank apps on their leaderboard -
            // optional, but recommended by their docs. Not sensitive.
            "HTTP-Referer": process.env.CLIENT_ORIGIN || "http://localhost:5173",
            "X-Title": "Stockpicker AI Analysis",
        },
        body: JSON.stringify({
            model: tier.model,
            messages: [{ role: "user", content: prompt }],
        }),
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`OpenRouter request failed (${response.status}) for ${tier.label}: ${detail}`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? "";
}

/**
 * @param {Array<{exchangeCode: string, stockCode: string, stockName: string, values?: Record<string, number>}>} stocks
 * @param {{aiModelTier?: string, aiPersona?: string, aiDetailLevel?: string, customInstructions?: string}} [preferences]
 *   The caller's saved ai_preferences row (see aiPreferences.service.js).
 * @returns {Promise<{mode: "single", text: string} | {mode: "comparison", comparison: object}>}
 *   A single shortlisted stock gets a free-text write-up (`mode: "single"`);
 *   two or more get a structured head-to-head comparison (`mode:
 *   "comparison"`) instead of independent per-stock analysis.
 */
export async function getQualitativeAnalysis(stocks, preferences = {}) {
    const { aiModelTier = "flash" } = preferences;
    const tier = MODEL_TIERS[aiModelTier] ?? MODEL_TIERS.flash;
    const isComparison = stocks.length > 1;
    const prompt = isComparison ? buildComparisonPrompt(stocks, preferences) : buildSingleStockPrompt(stocks, preferences);

    const text = tier.provider === "gemini" ? await callGemini(prompt) : await callOpenRouter(tier, prompt);

    if (!text) {
        throw new Error("AI provider returned an empty response");
    }

    return isComparison
        ? { mode: "comparison", comparison: parseComparisonResponse(text) }
        : { mode: "single", text: stripMarkdown(text) };
}
