const express = require("express");
const router = express.Router();
const { protect, admin } = require("../middleware/authMiddleware");
const {
  getAllBooks,
  getBookId,
  createBook,
  updateBook,
  deleteBook,
} = require("../controllers/bookControllers");
const upload = require("../middleware/upload");

router.get("/", protect, getAllBooks);
router.get("/:id", protect, getBookId);
router.post("/", protect, admin, upload.single("coverImage"), createBook);
router.put("/:id", protect, admin, upload.single("coverImage"), updateBook);
router.delete("/:id", protect, admin, deleteBook);

module.exports = router;
