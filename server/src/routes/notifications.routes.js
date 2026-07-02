import { Router } from "express";
import * as notificationsController from "../controllers/notifications.controller.js";

/**
 * Owner: Person 5 (Jayden) - Notifications & Optional AI Step.
 * Watchlist alerts (WhatsApp/Telegram) + optional AI recommendation
 * (requirement doc section 6, optional).
 */
const router = Router();

router.get("/watchlist", notificationsController.listWatchlist);
router.post("/watchlist", notificationsController.addToWatchlist);
router.delete("/watchlist/:id", notificationsController.removeFromWatchlist);

// Optional step (requirement doc section 6)
router.post("/ai-recommendation", notificationsController.getAiRecommendation);

export default router;
