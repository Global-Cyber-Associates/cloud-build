// /backend/src/controllers/dashboardController.js

import Dashboard from "../models/Dashboard.js";

export async function getDashboard(req, res) {
  try {
    const snapshot = await Dashboard.findById("dashboard_latest").lean();
    if (!snapshot) {
      return res.status(404).json({ message: "Dashboard not ready" });
    }
    res.json(snapshot);
  } catch (err) {
    console.error("Dashboard fetch error:", err);
    res.status(500).json({ error: "internal" });
  }
}

export async function getSummary(req, res) {
  try {
    const doc = await Dashboard.findById(
      "dashboard_latest",
      "summary timestamp"
    ).lean();

    if (!doc) {
      return res.status(404).json({ message: "Dashboard not ready" });
    }

    res.json(doc);
  } catch (err) {
    console.error("Dashboard summary error:", err);
    res.status(500).json({ error: "internal" });
  }
}
