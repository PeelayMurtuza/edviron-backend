// controllers/paymentController.js

const axios = require("axios");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const OrderStatus = require("../models/OrderStatus");

const PG_KEY = process.env.PG_KEY || "edvtest01";
const API_KEY = process.env.API_KEY || "your-api-key";
const SCHOOL_ID = process.env.SCHOOL_ID || "65b0e6293e9f76a9694d84b4";

/**
 * Create a new payment request
 */
exports.createPayment = async (req, res) => {
  try {
    const { trustee_id, student_info, gateway_name, amount, callback_url } = req.body;

    // 1. Sign payload with PG_KEY
    const payload = { school_id: SCHOOL_ID, amount, callback_url };
    const sign = jwt.sign(payload, PG_KEY);

    // 2. Call Edviron API
    const response = await axios.post(
      "https://dev-vanilla.edviron.com/erp/create-collect-request",
      { school_id: SCHOOL_ID, amount, callback_url, sign },
      { headers: { Authorization: `Bearer ${API_KEY}` } }
    );

    const { collect_request_id, Collect_request_url } = response.data;

    // 3. Save base order
    await Order.create({
      _id: collect_request_id,
      school_id: SCHOOL_ID,
      trustee_id,
      student_info,
      gateway_name,
    });

    // 4. Save initial status (so UI always has something to show)
    await OrderStatus.create({
      collect_id: collect_request_id,
      order_amount: amount,
      transaction_amount: 0, // will be updated after webhook
      payment_mode: "PENDING",
      payment_details: "Awaiting payment",
      bank_reference: "N/A",
      payment_message: "Pending",
      status: "PENDING",
    });

    res.json({
      message: "Payment link created successfully",
      collect_id: collect_request_id,
      payment_url: Collect_request_url,
    });
  } catch (err) {
    console.error("createPayment error:", err.response?.data || err.message);
    res.status(500).json({ error: "Payment creation failed" });
  }
};

/**
 * Handle webhook from gateway
 */
exports.webhook = async (req, res) => {
  try {
    const { order_info } = req.body;
    if (!order_info?.order_id) {
      return res.status(400).json({ error: "Missing order_id in webhook" });
    }

    await OrderStatus.findOneAndUpdate(
      { collect_id: order_info.order_id },
      {
        collect_id: order_info.order_id,
        order_amount: order_info.order_amount,
        transaction_amount: order_info.transaction_amount || 0,
        payment_mode: order_info.payment_mode,
        payment_details: order_info.payment_details,
        bank_reference: order_info.bank_reference,
        payment_message: order_info.Payment_message ?? order_info.payment_message,
        status: order_info.status,
        error_message: order_info.error_message || null,
        payment_time: order_info.payment_time || new Date(),
      },
      { upsert: true, new: true }
    );

    res.json({ message: "Webhook processed successfully" });
  } catch (err) {
    console.error("webhook error:", err.message);
    res.status(500).json({ error: "Webhook processing failed" });
  }
};

/**
 * Fetch all transactions (paginated)
 */
exports.getTransactions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const sortField = req.query.sortField || "status_info.payment_time";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const pipeline = [
      {
        $lookup: {
          from: "orderstatuses",
          let: { orderIdStr: { $toString: "$_id" } },
          pipeline: [
            { $match: { $expr: { $eq: [{ $toString: "$collect_id" }, "$$orderIdStr"] } } },
          ],
          as: "status_info",
        },
      },
      { $unwind: { path: "$status_info", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          collect_id: { $toString: "$_id" },
          school_id: 1,
          gateway: "$gateway_name",
          order_amount: "$status_info.order_amount",
          transaction_amount: "$status_info.transaction_amount",
          status: "$status_info.status",
          payment_time: "$status_info.payment_time",
        },
      },
      { $sort: { [sortField]: sortOrder } },
      {
        $facet: {
          data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      },
      { $unwind: { path: "$totalCount", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          data: 1,
          total: { $ifNull: ["$totalCount.count", 0] },
        },
      },
    ];

    const result = await Order.aggregate(pipeline);
    const { data = [], total = 0 } = result[0] || {};

    res.json({
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      data,
    });
  } catch (err) {
    console.error("getTransactions error:", err.message);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
};

/**
 * Fetch transactions by school (paginated)
 */
exports.getTransactionsBySchool = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const sortField = req.query.sortField || "status_info.payment_time";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const matchCondition = mongoose.Types.ObjectId.isValid(schoolId)
      ? { school_id: mongoose.Types.ObjectId(schoolId) }
      : { school_id: schoolId };

    const pipeline = [
      { $match: matchCondition },
      {
        $lookup: {
          from: "orderstatuses",
          let: { orderIdStr: { $toString: "$_id" } },
          pipeline: [
            { $match: { $expr: { $eq: [{ $toString: "$collect_id" }, "$$orderIdStr"] } } },
          ],
          as: "status_info",
        },
      },
      { $unwind: { path: "$status_info", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          collect_id: { $toString: "$_id" },
          school_id: 1,
          gateway: "$gateway_name",
          order_amount: "$status_info.order_amount",
          transaction_amount: "$status_info.transaction_amount",
          status: "$status_info.status",
          payment_time: "$status_info.payment_time",
        },
      },
      { $sort: { [sortField]: sortOrder } },
      {
        $facet: {
          data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      },
      { $unwind: { path: "$totalCount", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          data: 1,
          total: { $ifNull: ["$totalCount.count", 0] },
        },
      },
    ];

    const result = await Order.aggregate(pipeline);
    const { data = [], total = 0 } = result[0] || {};

    res.json({
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      data,
    });
  } catch (err) {
    console.error("getTransactionsBySchool error:", err.message);
    res.status(500).json({ error: "Failed to fetch transactions for school" });
  }
};

/**
 * Fetch status of a single transaction
 */
exports.getTransactionStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) return res.status(400).json({ error: "orderId required" });

    let status = await OrderStatus.findOne({ collect_id: orderId }).lean();
    if (!status && mongoose.Types.ObjectId.isValid(orderId)) {
      status = await OrderStatus.findOne({ collect_id: mongoose.Types.ObjectId(orderId) }).lean();
    }

    if (!status) return res.status(404).json({ error: "Transaction not found" });

    res.json(status);
  } catch (err) {
    console.error("getTransactionStatus error:", err.message);
    res.status(500).json({ error: "Failed to fetch transaction status" });
  }
};
