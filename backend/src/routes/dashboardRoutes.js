const express = require("express");
const dashboardController = require("../controllers/dashboardController");
const { protect } = require("../middlewares/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/stats", dashboardController.getStats);
router.get("/recent-scans", dashboardController.getRecentScans);

module.exports = router;
