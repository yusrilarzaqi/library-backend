require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});
app.use(express.json());

// MongoDB Connection dengan optimizations untuk Vercel
const MONGODB_URI = process.env.MONGODB_URI;

// Database connection
const connectDB = async () => {
  try {
    if (!MONGODB_URI) {
      console.error("❌ MONGODB_URI is not defined");
      return;
    }

    console.log("🔗 Attempting MongoDB connection...");

    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    });

    console.log("✅ MongoDB connected successfully");

    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.log("⚠️ MongoDB disconnected");
    });
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
  }
};

// Health check endpoint
app.get("/api/health", (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const dbStatusText =
    {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    }[dbStatus] || "unknown";

  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    database: dbStatusText,
    environment: process.env.NODE_ENV || "development",
  });
});
// Simple test endpoint
app.get("/api/test", (req, res) => {
  res.json({
    message: "API is responding!",
    database:
      mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
  });
});

// Test endpoints untuk debugging
app.get("/api/debug", (req, res) => {
  res.json({
    status: "active",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    nodeVersion: process.version,
    memory: process.memoryUsage(),
    envVars: {
      MONGODB_URI: process.env.MONGODB_URI ? "Set" : "Not set",
      JWT_SECRET: process.env.JWT_SECRET ? "Set" : "Not set",
    },
  });
});

app.get("/api/error-test", (req, res) => {
  // Test error handling
  try {
    throw new Error("This is a test error");
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error test completed",
      error: error.message,
    });
  }
});

// Routes
try {
  app.use("/api/book", require("./routes/bookRoutes"));
  app.use("/api/auth", require("./routes/authRoutes"));
  app.use("/api/borrow", require("./routes/borrowRoutes"));
  app.use("/api/user", require("./routes/userRoutes"));
  console.log("✅ All routes loaded successfully");
} catch (error) {
  console.error("❌ Route loading failed:", error);
}

// Global error handling middleware
app.use((error, req, res, next) => {
  console.error("🔥 Global Error Handler:", error);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "production" ? {} : error.message,
  });
});

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(
        `🔗 MongoDB URI: ${process.env.MONGODB_URI ? "Set" : "Not set"}`,
      );
    });
  } catch (error) {
    console.error("❌ Server startup failed:", error);
    // Don't exit process in Vercel environment
  }
};

process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
});

// Start the server
startServer();

module.exports = app;
