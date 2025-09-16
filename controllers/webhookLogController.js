const { WebhookLog } = require("../models/webhookLog");

exports.createWebhookLog = async (req, res) => {
  try {
    const log = new WebhookLog(req.body);
    const savedLog = await log.save();
    res.status(201).json(savedLog);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getWebhookLogs = async (req, res) => {
  try {
    const logs = await WebhookLog.find();
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
