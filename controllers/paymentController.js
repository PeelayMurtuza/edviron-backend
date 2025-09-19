// controllers/paymentController.js

const axios = require("axios");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Order = require("../models/order");
const OrderStatus = require("../models/orderStatus");

const PG_KEY = process.env.PG_KEY || "edvtest01";
const API_KEY =
  process.env.API_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0cnVzdGVlSWQiOiI2NWIwZTU1MmRkMzE5NTBhOWI0MWM1YmEiLCJJbmRleE9mQXBpS2V5Ijo2fQ.IJWTYCOurGCFdRM2xyKtw6TEcuwXxGnmINrXFfsAdt0";  
const SCHOOL_ID = process.env.SCHOOL_ID || "65b0e6293e9f76a9694d84b4";

/**
 * ✅ Create Payment
 */
exports.createPayment = async (req, res) => {
  try {
    const { trustee_id, student_info, gateway_name, amount, callback_url } = req.body;

    const payload = { school_id: SCHOOL_ID, amount, callback_url };
    const sign = jwt.sign(payload, PG_KEY);

    const response = await axios.post(
      "https://dev-vanilla.edviron.com/erp/create-collect-request",
      { school_id: SCHOOL_ID, amount, callback_url, sign },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
      }
    );

    const { collect_request_id, Collect_request_url } = response.data;

    await Order.create({
      _id: collect_request_id,
      school_id: SCHOOL_ID,
      trustee_id,
      student_info,
      gateway_name,
    });

    await OrderStatus.create({
      collect_id: collect_request_id,
      order_amount: amount,
      transaction_amount: 0,
      payment_mode: "PENDING",
      payment_details: "Payment not completed yet",
      bank_reference: "N/A",
      payment_message: "Awaiting payment",
      status: "PENDING",
    });

    res.json({
      message: "Payment link created",
      collect_id: collect_request_id,
      payment_url: Collect_request_url,
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Payment creation failed" });
  }
};

/**
 * ✅ Webhook handler
 */
exports.webhook = async (req, res) => {
  try {
    const { order_info } = req.body;
    if (!order_info?.order_id) {
      return res.status(400).json({ error: "order_info.order_id missing" });
    }

    await OrderStatus.findOneAndUpdate(
      { collect_id: order_info.order_id },
      {
        collect_id: order_info.order_id,
        order_amount: order_info.order_amount,
        transaction_amount: order_info.transaction_amount,
        payment_mode: order_info.payment_mode,
        payment_details: order_info.payment_details,
        bank_reference: order_info.bank_reference,
        payment_message: order_info.Payment_message ?? order_info.payment_message,
        status: order_info.status,
        error_message: order_info.error_message,
        payment_time: order_info.payment_time,
      },
      { upsert: true, new: true }
    );

    res.json({ message: "Webhook processed" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Webhook failed" });
  }
};

/**
 * ✅ Fetch All Transactions (search + status + date + pagination + sorting)
 */
exports.getTransactions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const sortField = req.query.sortField || "status_info.payment_time";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const skip = (page - 1) * limit;

    const { search, status, dateFrom, dateTo } = req.query;
    let matchStage = {};

    // 🔍 Search
    if (search) {
      const orConditions = [{ custom_order_id: search }];
      if (mongoose.Types.ObjectId.isValid(search)) {
        orConditions.push({ _id: new mongoose.Types.ObjectId(search) });
      }
      orConditions.push({ _id: search });
      matchStage.$or = orConditions;
    }

    // 🎯 Status
    if (status) {
      matchStage["status_info.status"] = Array.isArray(status)
        ? { $in: status }
        : status;
    }

    // 📅 Date range
    if (dateFrom || dateTo) {
      matchStage["status_info.payment_time"] = {};
      if (dateFrom) matchStage["status_info.payment_time"].$gte = new Date(dateFrom);
      if (dateTo) matchStage["status_info.payment_time"].$lte = new Date(dateTo);
    }

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
          collect_id: { $ifNull: [{ $toString: "$_id" }, null] },
          school_id: 1,
          gateway: "$gateway_name",
          order_amount: { $ifNull: ["$status_info.order_amount", null] },
          transaction_amount: { $ifNull: ["$status_info.transaction_amount", null] },
          status: { $ifNull: ["$status_info.status", null] },
          payment_time: { $ifNull: ["$status_info.payment_time", null] },
          status_info: 1,
        },
      },
      ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
      { $sort: { [sortField]: sortOrder } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      },
      { $unwind: { path: "$totalCount", preserveNullAndEmptyArrays: true } },
      { $project: { data: 1, total: { $ifNull: ["$totalCount.count", 0] } } },
    ];

    const aggResult = await Order.aggregate(pipeline);
    const doc = aggResult[0] || { data: [], total: 0 };

    res.json({
      page,
      limit,
      total: doc.total || 0,
      totalPages: Math.max(1, Math.ceil((doc.total || 0) / limit)),
      data: doc.data || [],
    });
  } catch (err) {
    console.error("getTransactions error:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Fetch Transactions By School (with filters)
 */
exports.getTransactionsBySchool = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const sortField = req.query.sortField || "status_info.payment_time";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const skip = (page - 1) * limit;

    const { search, status, dateFrom, dateTo } = req.query;
    let matchStage = {
      school_id: mongoose.Types.ObjectId.isValid(schoolId)
        ? new mongoose.Types.ObjectId(schoolId)
        : schoolId,
    };

    // 🔍 Search
    if (search) {
      const orConditions = [{ custom_order_id: search }];
      if (mongoose.Types.ObjectId.isValid(search)) {
        orConditions.push({ _id: new mongoose.Types.ObjectId(search) });
      }
      orConditions.push({ _id: search });
      matchStage.$or = orConditions;
    }

    // 🎯 Status
    if (status) {
      matchStage["status_info.status"] = Array.isArray(status)
        ? { $in: status }
        : status;
    }

    // 📅 Date range
    if (dateFrom || dateTo) {
      matchStage["status_info.payment_time"] = {};
      if (dateFrom) matchStage["status_info.payment_time"].$gte = new Date(dateFrom);
      if (dateTo) matchStage["status_info.payment_time"].$lte = new Date(dateTo);
    }

    const pipeline = [
      { $match: { school_id: matchStage.school_id } },
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
          collect_id: { $ifNull: [{ $toString: "$_id" }, null] },
          school_id: 1,
          gateway: "$gateway_name",
          order_amount: { $ifNull: ["$status_info.order_amount", null] },
          transaction_amount: { $ifNull: ["$status_info.transaction_amount", null] },
          status: { $ifNull: ["$status_info.status", null] },
          payment_time: { $ifNull: ["$status_info.payment_time", null] },
          status_info: 1,
        },
      },
      ...(Object.keys(matchStage).length > 1 ? [{ $match: matchStage }] : []),
      { $sort: { [sortField]: sortOrder } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      },
      { $unwind: { path: "$totalCount", preserveNullAndEmptyArrays: true } },
      { $project: { data: 1, total: { $ifNull: ["$totalCount.count", 0] } } },
    ];

    const aggResult = await Order.aggregate(pipeline);
    const doc = aggResult[0] || { data: [], total: 0 };

    res.json({
      page,
      limit,
      total: doc.total || 0,
      totalPages: Math.max(1, Math.ceil((doc.total || 0) / limit)),
      data: doc.data || [],
    });
  } catch (err) {
    console.error("getTransactionsBySchool error:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Check Transaction Status
 */
exports.getTransactionStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) return res.status(400).json({ error: "orderId required" });

    let status = await OrderStatus.findOne({ collect_id: orderId }).lean();
    if (!status && mongoose.Types.ObjectId.isValid(orderId)) {
      status = await OrderStatus.findOne({ collect_id: new mongoose.Types.ObjectId(orderId) }).lean();
    }

    if (!status) return res.status(404).json({ error: "Not found" });
    res.json(status);
  } catch (err) {
    console.error("getTransactionStatus error:", err);
    res.status(500).json({ error: err.message });
  }
};
