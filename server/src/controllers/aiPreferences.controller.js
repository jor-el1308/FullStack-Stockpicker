/**
 * Owner: Person 1 (Yong Wee) - Auth + AI Recommendation.
 * Wires the HTTP layer to aiPreferences.service.js.
 */
import { z } from "zod";
import {
    getAiPreferences,
    updateAiPreferences,
    AI_MODEL_TIERS,
    AI_PERSONAS,
    AI_DETAIL_LEVELS,
} from "../services/aiPreferences.service.js";

const patchSchema = z
    .object({
        aiModelTier: z.enum(AI_MODEL_TIERS).optional(),
        aiPersona: z.enum(AI_PERSONAS).optional(),
        aiDetailLevel: z.enum(AI_DETAIL_LEVELS).optional(),
        customInstructions: z.string().trim().max(1000, "Keep custom instructions under 1000 characters").optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: "Provide at least one field to update" });

export async function getMyAiPreferences(req, res) {
    try {
        const preferences = await getAiPreferences(req.userId);
        return res.json({ success: true, data: preferences });
    } catch (err) {
        console.error("[aiPreferences] getMyAiPreferences failed:", err.message);
        return res.status(500).json({ success: false, error: { message: "Could not load AI preferences." } });
    }
}

export async function updateMyAiPreferences(req, res) {
    const parsed = patchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            error: { message: "Invalid AI preferences", details: parsed.error.flatten() },
        });
    }

    try {
        const preferences = await updateAiPreferences(req.userId, parsed.data);
        return res.json({ success: true, data: preferences });
    } catch (err) {
        console.error("[aiPreferences] updateMyAiPreferences failed:", err.message);
        return res.status(500).json({ success: false, error: { message: "Could not update AI preferences." } });
    }
}
