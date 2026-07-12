import { Router } from "express";
import * as aiController from "../controllers/ai.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireActiveAccount } from "../middleware/subscription.middleware.js";

/**
 * Owner: Person 1 (Yong Wee) - Auth + AI Recommendation.
 * Same paywall gate as screener/stocks/dashboard - AI analysis is a
 * post-screen feature, so it requires a logged-in AND paid/active account.
 */
const router = Router();

router.use(requireAuth, requireActiveAccount);

router.post("/analyze", aiController.analyzeStocks);

export default router;