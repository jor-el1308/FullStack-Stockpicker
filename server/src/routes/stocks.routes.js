import { Router } from "express";
import * as stocksController from "../controllers/stocks.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireActiveAccount } from "../middleware/subscription.middleware.js";

/**
 * Owner: Person 2 (Charles) - Data Collection & Database Design.
 * Read-only endpoints over the data this workstream owns: stock lookup,
 * daily price/OHLC, market cap, dividends, and yearly financials
 * (revenue / PBT / PAT / EBITA). Persons 3 and 4 build on top of these.
 *
 * Paywall (Person 2 - Subscription): everything here requires a logged-in
 * AND paid/active account - see middleware/subscription.middleware.js.
 */
const router = Router();

router.use(requireAuth, requireActiveAccount);

// Requirement doc section 4: exchange + stock code -> stock name lookup
router.get("/lookup", stocksController.lookupStocks);
router.get("/:exchangeCode/:stockCode", stocksController.getStockDetail);
router.get("/:exchangeCode/:stockCode/prices", stocksController.getDailyPrices);
router.get("/:exchangeCode/:stockCode/financials", stocksController.getFinancials);

export default router;
