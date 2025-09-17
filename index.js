const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const connectDB = require("./config/db");
const cors = require("cors");
// Load env
dotenv.config();

// Import routes
const authRoutes = require("./routes/authRoutes");
const webhookLogRoutes = require("./routes/webhookLogRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

const app = express();

app.use(cors({
  origin: "http://localhost:5173", 
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true, //for cookies
}));

// Body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Connect to DB
connectDB();

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/webhook-logs", webhookLogRoutes);
app.use("/api/payments", paymentRoutes);

// Health check route
app.get("/", (req, res) => res.send("API is running..."));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
