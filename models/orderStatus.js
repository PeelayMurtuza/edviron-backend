const mongoose = require("mongoose");

const orderStatusSchema = new mongoose.Schema({
  collect_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    required: true,
  },
  order_amount: { type: Number, required: true },
  transaction_amount: { type: Number, required: true },
  payment_mode: { type: String, required: true },
  payment_details: { type: String, required: true },
  bank_reference: { type: String, required: true },
  payment_message: { type: String, required: true },
  status: { type: String, required: true, enum: ["PENDING", "SUCCESS", "FAILED"] },
  error_message: { type: String, default: null },
  payment_time: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model("OrderStatus", orderStatusSchema);
