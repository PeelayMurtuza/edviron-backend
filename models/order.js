const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  school_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "School", // optional
  },
  trustee_id: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  student_info: {
    name: { type: String, required: true },
    id: { type: String, required: true },
    email: { type: String, required: true },
  },
  gateway_name: {
    type: String,
    required: true,
  },
}, { timestamps: true });

// Export the model directly
module.exports = mongoose.model("Order", orderSchema);
