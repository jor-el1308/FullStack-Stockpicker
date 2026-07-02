import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";

/**
 * Owner: Person 1 (Yong Wee) - Auth & User Management.
 * Login/signup, profile, and the backend for saved criteria sets tied to a user.
 */
const router = Router();

router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.get("/me", authController.getProfile);

// Saved criteria sets ("Criteria 1, 2, 3 quick-select" feature)
router.get("/me/criteria-sets", authController.listCriteriaSets);
router.post("/me/criteria-sets", authController.saveCriteriaSet);

export default router;
