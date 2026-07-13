import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import * as oauthController from "../controllers/oauth.controller.js";

/**
 * Owner: Person 1 (Yong Wee) - Auth & User Management.
 * Login/signup, profile, and the backend for saved criteria sets tied to a user.
 */
const router = Router();

router.post("/signup", authController.signup);
router.post("/login", authController.login);
// Login 2FA (Person 1's flow, added by Person 2): step 2 after login()
// emails a code - see auth.controller.js.
router.post("/verify-otp", authController.verifyLoginOtp);
router.post("/resend-otp", authController.resendLoginOtp);
router.get("/me", requireAuth, authController.getProfile);

// Saved criteria sets ("Criteria 1, 2, 3 quick-select" feature)
router.get("/me/criteria-sets", requireAuth, authController.listCriteriaSets);
router.post("/me/criteria-sets", requireAuth, authController.saveCriteriaSet);
router.delete("/me/criteria-sets/:id", requireAuth, authController.deleteCriteriaSet);

// OAuth Routes
router.get("/oauth/:provider/start", oauthController.start);
router.get("/oauth/:provider/callback", oauthController.callback);
router.get("/me", requireAuth, authController.me);

export default router;
