import { Router } from "express";
import * as stocksController from "../controllers/stocks.controller.js";

/**
 * Owner: Person 2 (Charles) - Data Collection & Database Design.
 * Read-only endpoints over the data this workstream owns: stock lookup,
 * daily price/OHLC, market cap, dividends, and yearly financials
 * (revenue / PBT / PAT / EBITA). Persons 3 and 4 build on top of these.
 */
const router = Router();

// Requirement doc section 4: exchange + stock code -> stock name lookup
router.get("/lookup", stocksController.lookupStocks);
router.get("/:exchangeCode/:stockCode", stocksController.getStockDetail);
router.get("/:exchangeCode/:stockCode/prices", stocksController.getDailyPrices);
router.get("/:exchangeCode/:stockCode/financials", stocksController.getFinancials);

export default router;
