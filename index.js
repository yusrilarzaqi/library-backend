require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const responseHelper = require("./utils/responseHelper");

const app = express();

// Security middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// Compression middleware
app.use(compression());

// CORS configuration
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : "*",
    credentials: true,
  }),
);

// Middleware
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      try {
        JSON.parse(buf);
      } catch (e) {
        res.status(400).json({
          success: false,
          message: "Invalid JSON payload",
        });
        throw new Error("Invalid JSON");
      }
    },
  }),
);
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      try {
        JSON.parse(buf);
      } catch (e) {
        res.status(400).json({
          success: false,
          message: "Invalid JSON payload",
        });
        throw new Error("Invalid JSON");
      }
    },
  }),
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  }),
);

app.use((req, res, next) => {
  const start = Date.now();
  console.log(
    `${new Date().toISOString()} - ${req.method} ${req.originalUrl} - IP: ${req.ip}`,
  );

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `${new Date().toISOString()} - ${req.method} ${req.originalUrl} - Status: ${res.statusCode} - Duration: ${duration}ms`,
    );
  });

  next();
});

// MongoDB Connection dengan optimizations untuk Vercel
const MONGODB_URI = process.env.MONGODB_URI;

// Database connection
const connectDB = async (retries = 5, delay = 5000) => {
  try {
    if (!MONGODB_URI) {
      console.error("❌ MONGODB_URI is not defined");
      return;
    }

    console.log("🔗 Attempting MongoDB connection...");

    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 5,
    });

    console.log("✅ MongoDB connected successfully");

    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.log("⚠️ MongoDB disconnected");
    });
  } catch (error) {
    console.error(
      `❌ MongoDB connection failed (${retries} retries left):`,
      error.message,
    );
    if (retries > 0) {
      console.log(`Retrying in ${delay / 1000} seconds...`);
      setTimeout(() => connectDB(retries - 1, delay), delay);
    } else {
      console.error("❌ MongoDB connection failed after all retries");
    }
  }
};

// Health check yang lebih comprehensive
app.get("/api/health", async (req, res) => {
  const healthCheck = {
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    environment: process.env.NODE_ENV || "development",
  };

  try {
    // Test database connection
    await mongoose.connection.db.admin().ping();
    healthCheck.database = "connected";

    res.status(200).json(healthCheck);
  } catch (error) {
    healthCheck.status = "ERROR";
    healthCheck.database = "disconnected";
    healthCheck.error = error.message;

    res.status(503).json(healthCheck);
  }
});
// Simple test endpoint
app.get("/api/test", (_, res) => {
  res.json({
    message: "API is responding!",
    database:
      mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
  });
});

// Test endpoints untuk debugging
app.get("/api/debug", (_, res) => {
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

// Error test endpoint
app.get("/api/error-test", (_, res) => {
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
const loadRoutes = () => {
  const routes = [
    { path: "/api/book", route: "./routes/bookRoutes" },
    { path: "/api/auth", route: "./routes/authRoutes" },
    { path: "/api/borrow", route: "./routes/borrowRoutes" },
    { path: "/api/user", route: "./routes/userRoutes" },
  ];

  routes.forEach(({ path: routePath, route }) => {
    try {
      app.use(routePath, require(route));
      console.log(`✅ Route loaded: ${routePath}`);
    } catch (error) {
      console.error(`❌ Failed to load route ${routePath}:`, error);
    }
  });
};

loadRoutes();

// Global error handling middleware
app.use((error, req, res, next) => {
  console.error("🔥 Global Error Handler:", error);

  // Mongoose validation errors
  if (error.name === "ValidationError") {
    return responseHelper.validationError(
      res,
      Object.values(error.errors).map((err) => err.message),
    );
  }

  // Mongoose duplicate key errors
  if (error.code === 11000) {
    return responseHelper.validationError(
      res,
      {
        message: "Duplicate key error",
      },
      400,
    );
  }

  // Mongoose cast errors
  if (error.name === "CastError") {
    return responseHelper.validationError(
      res,
      {
        message: "Invalid ID format",
      },
      400,
    );
  }

  // JWT errors
  if (error.name === "JsonWebTokenError") {
    return responseHelper.validationError(
      res,
      {
        message: "Invalid token",
      },
      401,
    );
  }

  // Default error
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : error.message;

  responseHelper.error(res, message, 500);
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
