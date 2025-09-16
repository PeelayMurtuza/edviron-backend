const express = require("express");
const { createWebhookLog, getWebhookLogs } = require("../controllers/webhookLogController");
const { protect } = require("../middleware/auth");

const router = express.Router();

router.post("/", protect, createWebhookLog);
router.get("/", protect, getWebhookLogs);

module.exports = router;
