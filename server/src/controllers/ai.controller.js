/**
 * Owner: Person 1 (Yong Wee) - Auth + AI Recommendation.
 * Wires the HTTP layer to ai.service.js. Validates the shortlist coming
 * from the client (max 10 stocks - keeps prompt size and free-tier request
 * cost bounded) before calling out to the AI provider.
 */
import { z } from "zod";
import { getQualitativeAnalysis } from "../services/ai.service.js";
import {
    saveAiAnalysis,
    listAiAnalysisHistory,
    updateAiAnalysis,
    deleteAiAnalysis,
    AiAnalysisNotFoundError,
} from "../services/aiHistory.service.js";

const stockSchema = z.object({
    exchangeCode: z.string().min(1),
    stockCode: z.string().min(1),
    stockName: z.string().min(1),
    values: z.record(z.number()).optional(),
});

const analyzeRequestSchema = z.object({
    stocks: z.array(stockSchema).min(1, "Select at least one stock").max(10, "Select at most 10 stocks"),
});

// At least one of title/analysisText must be present - a PATCH with neither
// is a no-op the client should never send, but reject it explicitly rather
// than silently doing nothing.
const updateHistorySchema = z
    .object({
        title: z.string().trim().min(1, "Title can't be empty").max(200).optional(),
        analysisText: z.string().trim().min(1, "Analysis text can't be empty").optional(),
    })
    .refine((data) => data.title !== undefined || data.analysisText !== undefined, {
        message: "Provide a title and/or analysisText to update",
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
        try {
            await saveAiAnalysis(req.userId, parsed.data.stocks, analysis);
        } catch (err) {
            // Best-effort - a DB hiccup shouldn't hide the analysis the user is
            // already looking at, it just won't show up in their history later.
            console.error("[ai] failed to persist analysis history:", err.message);
        }
        return res.json({ success: true, data: { analysis } });
    } catch (err) {
        console.error("[ai] analyzeStocks failed:", err.message);
        return res.status(500).json({
            success: false,
            error: { message: "AI analysis failed. Check AI_RECOMMENDATION_API_KEY is set and valid." },
        });
    }
}

export async function getAiHistory(req, res) {
    try {
        const history = await listAiAnalysisHistory(req.userId);
        return res.json({ success: true, data: { history } });
    } catch (err) {
        console.error("[ai] getAiHistory failed:", err.message);
        return res.status(500).json({
            success: false,
            error: { message: "Could not load AI analysis history." },
        });
    }
}

export async function updateAiHistoryEntry(req, res) {
    const parsed = updateHistorySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            error: { message: "Invalid update", details: parsed.error.flatten() },
        });
    }

    try {
        const entry = await updateAiAnalysis(req.userId, req.params.id, parsed.data);
        return res.json({ success: true, data: entry });
    } catch (err) {
        if (err instanceof AiAnalysisNotFoundError) {
            return res.status(404).json({ success: false, error: { message: err.message } });
        }
        console.error("[ai] updateAiHistoryEntry failed:", err.message);
        return res.status(500).json({ success: false, error: { message: "Could not update AI analysis." } });
    }
}

export async function deleteAiHistoryEntry(req, res) {
    try {
        await deleteAiAnalysis(req.userId, req.params.id);
        return res.json({ success: true, data: { id: req.params.id } });
    } catch (err) {
        if (err instanceof AiAnalysisNotFoundError) {
            return res.status(404).json({ success: false, error: { message: err.message } });
        }
        console.error("[ai] deleteAiHistoryEntry failed:", err.message);
        return res.status(500).json({ success: false, error: { message: "Could not delete AI analysis." } });
    }
}