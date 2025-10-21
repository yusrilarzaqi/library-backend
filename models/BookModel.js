const mongoose = require("mongoose");

const bookSchema = new mongoose.Schema(
  {
    nomor: { type: String, required: true, unique: true },
    judul: { type: String, required: true },
    level: { type: String, required: true },
    penulis: { type: String, required: true },
    kodeJudul: { type: String, required: true },
    kodePenulis: { type: String, required: true },
    status: {
      type: String,
      enum: ["available", "borrowed"],
      default: "available",
    },
    borrowedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    coverImage: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Book", bookSchema);
