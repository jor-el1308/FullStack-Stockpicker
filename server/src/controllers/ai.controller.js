/**
 * Owner: Person 1 (Yong Wee) - Auth + AI Recommendation.
 * Wires the HTTP layer to ai.service.js. Validates the shortlist coming
 * from the client (max 10 stocks - keeps prompt size and free-tier request
 * cost bounded) before calling out to the AI provider.
 */
import { z } from "zod";
import { getQualitativeAnalysis, getFollowUpAnswer } from "../services/ai.service.js";
import {
    saveAiAnalysis,
    listAiAnalysisHistory,
    updateAiAnalysis,
    deleteAiAnalysis,
    AiAnalysisNotFoundError,
} from "../services/aiHistory.service.js";
import { getAiPreferences } from "../services/aiPreferences.service.js";

const stockSchema = z.object({
    exchangeCode: z.string().min(1),
    stockCode: z.string().min(1),
    stockName: z.string().min(1),
    values: z.record(z.number()).optional(),
});

const analyzeRequestSchema = z.object({
    stocks: z.array(stockSchema).min(1, "Select at least one stock").max(10, "Select at most 10 stocks"),
});

// Follow-up chat (POST /ai/chat, see AiChatBox.jsx) - stateless for now, no
// conversation is persisted server-side, so the client re-sends the full
// context (persona/preferences, stocks, original analysis, and prior turns)
// with every question. `preferences` is a loose partial rather than reusing
// AI_PERSONAS/AI_DETAIL_LEVELS/AI_MODEL_TIERS enums, since it's just an
// unvalidated echo of whatever the original /analyze call resolved -
// ai.service.js already falls back safely on an unrecognised value.
const chatPreferencesSchema = z
    .object({
        aiModelTier: z.string().optional(),
        aiPersona: z.string().optional(),
        aiDetailLevel: z.string().optional(),
        customInstructions: z.string().optional(),
    })
    .partial()
    .optional();

const chatMessageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(4000),
});

const chatRequestSchema = z.object({
    stocks: z.array(stockSchema).min(1, "Select at least one stock").max(10, "Select at most 10 stocks"),
    mode: z.enum(["single", "comparison"]),
    originalAnalysis: z.string().trim().min(1, "Missing the original analysis to follow up on"),
    preferences: chatPreferencesSchema,
    history: z.array(chatMessageSchema).max(40).optional(),
    question: z.string().trim().min(1, "Ask a question first").max(2000),
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
        const preferences = await getAiPreferences(req.userId);
        const result = await getQualitativeAnalysis(parsed.data.stocks, preferences);
        // Comparisons are structured objects (see ai.service.js) - stored as
        // JSON text in the same analysis_text column single-stock write-ups
        // use, and detected on read (AiHistory.jsx JSON.parses it back) so no
        // schema change/migration is needed for the new shape.
        const analysis = result.mode === "comparison" ? result.comparison : result.text;
        const analysisText = result.mode === "comparison" ? JSON.stringify(result.comparison) : result.text;
        try {
            await saveAiAnalysis(req.userId, parsed.data.stocks, analysisText);
        } catch (err) {
            // Best-effort - a DB hiccup shouldn't hide the analysis the user is
            // already looking at, it just won't show up in their history later.
            console.error("[ai] failed to persist analysis history:", err.message);
        }
        // `preferences` (persona/detail/model tier/custom instructions) is
        // echoed back so the client can snapshot exactly what this run used
        // into its follow-up chat context (see AiChatBox.jsx) - the user's
        // saved preferences can change later, but a follow-up on this run
        // should stay anchored to what actually produced it.
        return res.json({ success: true, data: { analysis, mode: result.mode, preferences } });
    } catch (err) {
        console.error("[ai] analyzeStocks failed:", err.message);
        return res.status(500).json({
            success: false,
            error: {
                message:
                    "AI analysis failed. Check AI_RECOMMENDATION_API_KEY (Gemini) or OPENROUTER_API_KEY " +
                    "(other models) is set and valid.",
            },
        });
    }
}

export async function chatAboutStocks(req, res) {
    const parsed = chatRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            error: { message: "Invalid chat request", details: parsed.error.flatten() },
        });
    }

    try {
        const reply = await getFollowUpAnswer(parsed.data);
        return res.json({ success: true, data: { reply } });
    } catch (err) {
        console.error("[ai] chatAboutStocks failed:", err.message);
        return res.status(500).json({
            success: false,
            error: {
                message:
                    "AI chat failed. Check AI_RECOMMENDATION_API_KEY (Gemini) or OPENROUTER_API_KEY " +
                    "(other models) is set and valid.",
            },
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