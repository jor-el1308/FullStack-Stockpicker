import express from "express";
import cors from "cors";
import helmet from "helmet";
import "dotenv/config";

import authRoutes from "./routes/auth.routes.js";
import subscriptionRoutes from "./routes/subscription.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import stocksRoutes from "./routes/stocks.routes.js";
import screenerRoutes from "./routes/screener.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js";
import aiRoutes from "./routes/ai.routes.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ success: true, data: { status: "ok" } });
  });

  // Each route module is owned by one workstream (see README "Team ownership").
  app.use("/api/auth", authRoutes); // Person 1
  app.use("/api/subscription", subscriptionRoutes); // Person 2 - Paywall (deliberately NOT gated by requireActiveAccount)
  app.use("/api/admin", adminRoutes); // Person 2 - Admin dashboard (requireAuth + requireAdmin, not requireActiveAccount)
  app.use("/api/stocks", stocksRoutes); // Person 2 - gated by requireAuth + requireActiveAccount
  app.use("/api/screener", screenerRoutes); // Person 3 - gated by requireAuth + requireActiveAccount
  app.use("/api/dashboard", dashboardRoutes); // Person 4 - gated by requireAuth + requireActiveAccount
  app.use("/api/notifications", notificationsRoutes); // Person 5 - gated by requireAuth + requireActiveAccount
  app.use("/api/ai", aiRoutes); // Person 1 - gated by requireAuth + requireActiveAccount

  // Fallback 404
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: { message: "Not found" } });
  });

  return app;
}
