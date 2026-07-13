/**
 * Owner: Person 1 (Yong Wee) - Auth + AI Recommendation.
 * Wires the HTTP layer to ai.service.js. Validates the shortlist coming
 * from the client (max 10 stocks - keeps prompt size and free-tier request
 * cost bounded) before calling out to the AI provider.
 */
import { z } from "zod";
import { getQualitativeAnalysis } from "../services/ai.service.js";

const stockSchema = z.object({
    exchangeCode: z.string().min(1),
    stockCode: z.string().min(1),
    stockName: z.string().min(1),
    values: z.record(z.number()).optional(),
});

const analyzeRequestSchema = z.object({
    stocks: z.array(stockSchema).min(1, "Select at least one stock").max(10, "Select at most 10 stocks"),
});

export async function analyzeStocks(req, res) {
    const parsed = analyzeRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            error: { message: "Invalid AI analysis request", details: parsed.error.flatten() },
        });
    }

    try {
        const analysis = await getQualitativeAnalysis(parsed.data.stocks);
        return res.json({ success: true, data: { analysis } });
    } catch (err) {
        console.error("[ai] analyzeStocks failed:", err.message);
        return res.status(500).json({
            success: false,
            error: { message: "AI analysis failed. Check AI_RECOMMENDATION_API_KEY is set and valid." },
        });
    }
}