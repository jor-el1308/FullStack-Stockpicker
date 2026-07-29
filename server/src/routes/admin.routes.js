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
router.get("/export/users.csv", adminController.exportUsersCsv);
router.get("/export/payments.csv", adminController.exportPaymentsCsv);
router.get("/export/summary.pdf", adminController.exportSummaryPdf);
router.post("/cache/clear", adminController.clearCache); // force-refresh stock data cache (see utils/cache.js) after re-running ingestion
router.post("/reseed", adminController.reseedData); // re-run ingestion/ingest.py to pull fresh data from Yahoo Finance
router.get("/reseed/status", adminController.getReseedStatus); // poll progress/output of the in-flight (or last) reseed run
router.get("/reseed/schedule", adminController.getReseedSchedule);
router.post("/reseed/schedule", adminController.setReseedSchedule); // body: { intervalHours: number|null } - null disables auto-reseed

export default router;
