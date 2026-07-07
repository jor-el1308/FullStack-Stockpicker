/**
 * Owner: Person 3 (Jorel) - Screener / Filter Engine.
 * Wires the HTTP layer to screener.service.js. Request/response shapes are
 * defined in shared/types/index.js (ScreenerRequest / ScreenerResponse).
 */
import { z } from "zod";
import { runScreen, getDefaultCriteria } from "../services/screener.service.js";

const criteriaRangeSchema = z.object({
  key: z.string(),
  label: z.string().optional(),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  weight: z.number().min(0).max(10).optional(),
});

const screenerRequestSchema = z.object({
  criteria: z.array(criteriaRangeSchema).default([]),
  excludeSectors: z.array(z.string()).optional(),
  minCompanyAgeYears: z.number().nonnegative().optional(),
  exchanges: z.array(z.string()).optional(),
});

export async function runScreener(req, res) {
  const parsed = screenerRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { message: "Invalid screener request", details: parsed.error.flatten() },
    });
  }

  try {
    const data = await runScreen(parsed.data);
    return res.json({ success: true, data });
  } catch (err) {
    console.error("[screener] runScreener failed:", err.message);
    return res.status(500).json({
      success: false,
      error: { message: "Screener query failed. Is the database migrated and seeded?" },
    });
  }
}

export async function getDefaultCriteriaHandler(_req, res) {
  return res.json({ success: true, data: { criteria: getDefaultCriteria() } });
}

// Backwards-compatible alias for the route's original import name.
export { getDefaultCriteriaHandler as getDefaultCriteria };
