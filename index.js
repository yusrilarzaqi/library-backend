require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3001", // frontend URL
    credentials: true,
  }),
);
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} : ${res.statusCode}`);
  next();
});
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});
app.use(express.json());

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Routes
app.use("/api/book", require("./routes/bookRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/borrow", require("./routes/borrowRoutes"));
app.use("/api/user", require("./routes/userRoutes"));
app.get("/test", (req, res) => {
  res.json({ message: "Hello from server!" });
});

// Database connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    // Start server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database connection error:", err);
    process.exit(1);
  });
