import { Router } from "express";
import * as dashboardController from "../controllers/dashboard.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireActiveAccount } from "../middleware/subscription.middleware.js";

/**
 * Owner: Person 4 (Enrico) - Dashboard & Stock Report Page.
 * Results table + per-stock detail page, plus the personal user-owned CRUD
 * features for these pages: stock notes, starred stocks, and price targets.
 *
 * Paywall (Person 2 - Subscription): everything here requires a logged-in
 * AND paid/active account - see middleware/subscription.middleware.js.
 */
const router = Router();

router.use(requireAuth, requireActiveAccount);

router.get("/summary/:exchangeCode/:stockCode", dashboardController.getStockSummary);

// ---- Stock notes (CRUD) ----
// Note: the ":id" routes are declared before the ":exchangeCode/:stockCode"
// ones so a note id can't be mistaken for an exchange code.
router.patch("/notes/:id", dashboardController.updateNote);
router.delete("/notes/:id", dashboardController.deleteNote);
router.get("/notes/:exchangeCode/:stockCode", dashboardController.listNotes);
router.post("/notes/:exchangeCode/:stockCode", dashboardController.createNote);

// ---- Starred stocks (create / read / delete) ----
router.get("/starred", dashboardController.listStarred);
router.post("/starred", dashboardController.addStar);
router.delete("/starred/:exchangeCode/:stockCode", dashboardController.removeStar);

// ---- Price target (create/update via POST upsert, read, delete) ----
router.get("/target/:exchangeCode/:stockCode", dashboardController.getTarget);
router.post("/target/:exchangeCode/:stockCode", dashboardController.setTarget);
router.delete("/target/:exchangeCode/:stockCode", dashboardController.deleteTarget);

export default router;