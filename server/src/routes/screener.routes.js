import { Router } from "express";
import * as screenerController from "../controllers/screener.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireActiveAccount } from "../middleware/subscription.middleware.js";

/**
 * Owner: Person 3 (Jorel) - Screener / Filter Engine.
 * Range-based filters per criterion, market-cap minimum, company-age
 * exclusion (<5yo), sector exclusions (gambling/tobacco), criteria weighting.
 *
 * Paywall (Person 2 - Subscription): everything here requires a logged-in
 * AND paid/active account - see middleware/subscription.middleware.js.
 *
 * NOTE (Person 2, not a paywall change): client/src/api/stocks.js calls
 * `GET /api/screener` for the dashboard's results table, but this router
 * only had POST /run and GET /default-criteria - no bare GET route - so
 * that call was 404ing. Added a GET / alias below that just runs the
 * default criteria so the dashboard has something to render; Person 3
 * should swap this for real default-criteria logic if it isn't already
 * equivalent to what runScreener does with no filters.
 */
const router = Router();

router.use(requireAuth, requireActiveAccount);

router.get("/", screenerController.runScreener);
router.post("/run", screenerController.runScreener);
router.get("/default-criteria", screenerController.getDefaultCriteria);

export default router;
