const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");

router.post("/create-payment", paymentController.createPayment);
router.post("/webhook", paymentController.webhook);
router.get("/transactions", paymentController.getTransactions);
router.get("/transactions/school/:schoolId", paymentController.getTransactionsBySchool);
router.get("/transaction-status/:orderId", paymentController.getTransactionStatus);

module.exports = router;
