const mongoose = require("mongoose");

const borrowedBookSchema = new mongoose.Schema({
  book: { type: mongoose.Schema.Types.ObjectId, ref: "Book" },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  status: { type: String, enum: ["borrowed", "returned"], default: "borrowed" },
  borrowedAt: { type: Date, default: Date.now },
  dueDate: { type: Date },
});

module.exports = mongoose.model("BorrowedBook", borrowedBookSchema);
