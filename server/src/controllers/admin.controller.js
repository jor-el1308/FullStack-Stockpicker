import * as adminService from "../services/admin.service.js";

/**
 * Owner: Person 2 (Charles) - Admin Dashboard.
 * All routes here are gated by requireAuth + requireAdmin - see
 * server/src/routes/admin.routes.js.
 */

export async function listUsers(_req, res) {
  try {
    const users = await adminService.listUsers();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}

export async function getStats(_req, res) {
  try {
    const stats = await adminService.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}

export async function revokeUser(req, res) {
  const targetId = req.params.id;
  if (targetId === req.userId) {
    return res.status(400).json({ success: false, error: { message: "You can't revoke your own access" } });
  }
  try {
    const user = await adminService.revokeUser(targetId);
    if (!user) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}

export async function restoreUser(req, res) {
  try {
    const user = await adminService.restoreUser(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}

export async function setAdmin(req, res) {
  const targetId = req.params.id;
  const { isAdmin } = req.body;
  if (typeof isAdmin !== "boolean") {
    return res.status(400).json({ success: false, error: { message: "isAdmin must be true or false" } });
  }
  if (targetId === req.userId && !isAdmin) {
    return res.status(400).json({ success: false, error: { message: "You can't remove your own admin access" } });
  }
  try {
    const user = await adminService.setAdmin(targetId, isAdmin);
    if (!user) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}

export async function getUserPayments(req, res) {
  try {
    const payments = await adminService.getUserPayments(req.params.id);
    res.json({ success: true, data: payments });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}

export function clearCache(_req, res) {
  const result = adminService.clearCache();
  res.json({ success: true, data: result });
}
