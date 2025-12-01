// /backend/src/api/d-board.js

import express from "express";
import { getDashboard, getSummary } from "../controllers/dashboardController.js";

const router = express.Router();

// GET /api/dashboard  -> full snapshot
router.get("/", getDashboard);

// GET /api/dashboard/summary -> small summary only
router.get("/summary", getSummary);

export default router;
