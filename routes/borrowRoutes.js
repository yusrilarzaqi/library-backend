const express = require("express");
const router = express.Router();
const { protect, admin } = require("../middleware/authMiddleware");
const {
  getDashboardStats,
  getRange,
  getAllTransactions,
  getBorrowedBooksByUserId,
  borrowBook,
  returnBook,
} = require("../controllers/borrowedBookControllers");

router.get("/stats", protect, admin, getDashboardStats);
router.get("/getRange", protect, admin, getRange);
router.get("/transactions", protect, admin, getAllTransactions);
router.get("/:id", protect, getBorrowedBooksByUserId);
router.post("/:id/borrow", protect, admin, borrowBook);
router.post("/:id/return", protect, admin, returnBook);

module.exports = router;
