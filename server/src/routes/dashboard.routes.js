import { Router } from "express";
import * as dashboardController from "../controllers/dashboard.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireActiveAccount } from "../middleware/subscription.middleware.js";

/**
 * Owner: Person 4 (Enrico) - Dashboard & Stock Report Page.
 * Results table + per-stock detail page (closing price graph, 52-week high/low).
 * Mostly consumes /api/stocks (Person 2) and /api/screener (Person 3);
 * this route file is for any dashboard-specific aggregation/formatting.
 *
 * Paywall (Person 2 - Subscription): everything here requires a logged-in
 * AND paid/active account - see middleware/subscription.middleware.js.
 */
const router = Router();

router.use(requireAuth, requireActiveAccount);

router.get("/summary/:exchangeCode/:stockCode", dashboardController.getStockSummary);

export default router;
