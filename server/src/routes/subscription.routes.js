import { Router } from "express";
import * as subscriptionController from "../controllers/subscription.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

/**
 * Owner: Person 2 (Charles) - Data Pipeline + Subscription/Paywall.
 *
 * All routes here only require `requireAuth` (logged in), NOT the stricter
 * `requireActiveAccount` (see middleware/subscription.middleware.js) - a
 * user has to be able to check their status and subscribe before they're
 * active, so this router is deliberately excluded from the account-activity
 * gate applied to screener/dashboard/notifications routes.
 */
const router = Router();

router.get("/status", requireAuth, subscriptionController.getStatus);

// Stripe Checkout (test mode) - see subscription.service.js
router.post("/checkout-session", requireAuth, subscriptionController.createCheckoutSession);
router.get("/verify-session", requireAuth, subscriptionController.verifySession);
router.post("/billing-portal", requireAuth, subscriptionController.createBillingPortalSession);

// Native cancel/resume (Settings page) - cancels at period end rather than
// redirecting out to Stripe's hosted billing portal. See subscription.service.js.
router.post("/cancel", requireAuth, subscriptionController.cancelSubscription);
router.post("/resume", requireAuth, subscriptionController.resumeSubscription);

router.get("/payments", requireAuth, subscriptionController.listPayments);

export default router;
