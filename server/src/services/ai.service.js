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
 */
function buildPrompt(stocks) {
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

    return `You are a financial analyst assistant helping a retail investor review a shortlist of stocks that just passed their screener criteria.

For EACH stock below, give a short qualitative take covering:
1. Recent news / context you're aware of (if none, say so - don't invent facts)
2. Growth outlook (brief)
3. 1-2 sentences of reasoning tying it back to the screener metrics given

Keep each stock's write-up to 3-4 sentences. End with a one-line disclaimer that this is not financial advice.

Shortlisted stocks:
${list}`;
}

/**
 * @param {Array<{exchangeCode: string, stockCode: string, stockName: string, values?: Record<string, number>}>} stocks
 * @returns {Promise<string>} plain-text analysis
 */
export async function getQualitativeAnalysis(stocks) {
    const client = getClient();
    const prompt = buildPrompt(stocks);

    const response = await client.models.generateContent({
        model: MODEL,
        contents: prompt,
    });

    const text = response.text;
    if (!text) {
        throw new Error("AI provider returned an empty response");
    }
    return text;
}