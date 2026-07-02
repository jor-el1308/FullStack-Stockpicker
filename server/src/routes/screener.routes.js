import { Router } from "express";
import * as screenerController from "../controllers/screener.controller.js";

/**
 * Owner: Person 3 (Jorel) - Screener / Filter Engine.
 * Range-based filters per criterion, market-cap minimum, company-age
 * exclusion (<5yo), sector exclusions (gambling/tobacco), criteria weighting.
 */
const router = Router();

router.post("/run", screenerController.runScreener);
router.get("/default-criteria", screenerController.getDefaultCriteria);

export default router;
