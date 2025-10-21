const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
const { protect, admin } = require("../middleware/authMiddleware");
const {
  getUser,
  getAllUsers,
  updateUser,
  deleteUser,
  getUserById,
} = require("../controllers/userControllers");

router.get("/", protect, admin, getAllUsers);
router.get("/profile", protect, getUser);
router.put("/:id", protect, upload.single("avatar"), updateUser);
router.delete("/:id", protect, admin, deleteUser);
router.get("/:id", protect, admin, getUserById);

module.exports = router;
