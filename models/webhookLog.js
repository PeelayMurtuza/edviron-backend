const mongoose = require("mongoose");

const webhookLogSchema = new mongoose.Schema({
  event_name: {
    type: String,
    required: true,
  },
  payload: {
    type: Object, // stores the webhook request body
    required: true,
  },
  response_status: {
    type: Number, // status code sent back
    required: true,
  },
  error_message: {
    type: String,
    default: null,
  },
  received_at: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

const WebhookLog = mongoose.model("WebhookLog", webhookLogSchema);
module.exports = { WebhookLog };
