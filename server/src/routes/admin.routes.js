import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";

/**
 * Owner: Person 2 (Charles) - Admin Dashboard.
 *
 * View all users and revoke/restore their access. No hard-delete on
 * purpose - see admin.service.js docstring. Deliberately NOT gated by
 * requireActiveAccount (see subscription.middleware.js) - an admin
 * managing the system shouldn't be locked out by their own paywall status.
 */
const router = Router();

router.use(requireAuth, requireAdmin);

router.get("/stats", adminController.getStats);
router.get("/users", adminController.listUsers);
router.post("/users/:id/revoke", adminController.revokeUser);
router.post("/users/:id/restore", adminController.restoreUser);
router.post("/users/:id/admin", adminController.setAdmin); // body: { isAdmin: true|false }
router.get("/users/:id/payments", adminController.getUserPayments);

export default router;
