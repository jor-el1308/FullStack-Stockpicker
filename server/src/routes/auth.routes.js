import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { loginLimiter, otpLimiter, signupLimiter } from "../middleware/rateLimit.middleware.js";

/**
 * Owner: Person 1 (Yong Wee) - Auth & User Management.
 * Login/signup, profile, and the backend for saved criteria sets tied to a user.
 */
const router = Router();

router.post("/signup", signupLimiter, authController.signup);
router.post("/login", loginLimiter, authController.login);
// Login 2FA (Person 1's flow, added by Person 2): step 2 after login()
// emails a code - see auth.controller.js.
router.post("/verify-otp", otpLimiter, authController.verifyLoginOtp);
router.post("/resend-otp", otpLimiter, authController.resendLoginOtp);
router.post("/logout", authController.logout);
router.get("/me", requireAuth, authController.getProfile);

// Saved criteria sets ("Criteria 1, 2, 3 quick-select" feature)
router.get("/me/criteria-sets", requireAuth, authController.listCriteriaSets);
router.post("/me/criteria-sets", requireAuth, authController.saveCriteriaSet);
router.delete("/me/criteria-sets/:id", requireAuth, authController.deleteCriteriaSet);

export default router;
