/**
 * Owner: Person 3 (Jorel) - Screener / Filter Engine.
 * Wires the HTTP layer to screener.service.js. Request/response shapes are
 * defined in shared/types/index.js (ScreenerRequest / ScreenerResponse).
 */
import { z } from "zod";
import { runScreen, getDefaultCriteria, getDistribution } from "../services/screener.service.js";

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

// Universe-level options only - the distribution endpoint ignores per-criterion
// ranges by design (see getDistribution in screener.service.js).
const distributionRequestSchema = z.object({
  excludeSectors: z.array(z.string()).optional(),
  minCompanyAgeYears: z.coerce.number().nonnegative().optional(),
  exchanges: z.array(z.string()).optional(),
});

/**
 * GET/POST /api/screener/distribution
 * Feeds the histograms drawn behind each Advanced Filters slider.
 * GET accepts repeatable/comma-separated `exchanges` and `excludeSectors`
 * query params; POST accepts the same fields as a JSON body.
 */
export async function getDistributionHandler(req, res) {
  const source =
    req.method === "GET"
      ? {
          exchanges: parseListParam(req.query.exchanges),
          excludeSectors: parseListParam(req.query.excludeSectors),
          ...(req.query.minCompanyAgeYears != null ? { minCompanyAgeYears: req.query.minCompanyAgeYears } : {}),
        }
      : req.body ?? {};

  const parsed = distributionRequestSchema.safeParse(source);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { message: "Invalid distribution request", details: parsed.error.flatten() },
    });
  }

  try {
    const data = await getDistribution(parsed.data);
    return res.json({ success: true, data });
  } catch (err) {
    console.error("[screener] getDistribution failed:", err.message);
    return res.status(500).json({
      success: false,
      error: { message: "Could not load the criteria distribution." },
    });
  }
}

/** `?exchanges=SGX&exchanges=NYSE` and `?exchanges=SGX,NYSE` both work. */
function parseListParam(value) {
  if (value == null) return undefined;
  const list = (Array.isArray(value) ? value : String(value).split(","))
    .map((v) => String(v).trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

export async function getDefaultCriteriaHandler(_req, res) {
  return res.json({ success: true, data: { criteria: getDefaultCriteria() } });
}

// Backwards-compatible alias for the route's original import name.
export { getDefaultCriteriaHandler as getDefaultCriteria };
export { getDistributionHandler as getDistribution };
