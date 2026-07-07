import { Router } from "express";
import * as notificationsController from "../controllers/notifications.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireActiveAccount } from "../middleware/subscription.middleware.js";

/**
 * Owner: Person 5 (Jayden) - Notifications & Optional AI Step.
 * Watchlist alerts (WhatsApp/Telegram) + optional AI recommendation
 * (requirement doc section 6, optional).
 *
 * Paywall (Person 2 - Subscription): everything here requires a logged-in
 * AND paid/active account - see middleware/subscription.middleware.js.
 */
const router = Router();

router.use(requireAuth, requireActiveAccount);

router.get("/watchlist", notificationsController.listWatchlist);
router.post("/watchlist", notificationsController.addToWatchlist);
router.delete("/watchlist/:id", notificationsController.removeFromWatchlist);

// Optional step (requirement doc section 6)
router.post("/ai-recommendation", notificationsController.getAiRecommendation);

export default router;
