const express = require("express");
const Book = require("../models/BookModel");
const BorrowedBook = require("../models/BorrowedBook");
const cloudinary = require("cloudinary").v2;
const responseHelper = require("../utils/responseHelper");

// Create data
exports.createBook = async (req, res) => {
  try {
    const { nomor, judul, level, penulis, kodeJudul, kodePenulis } = req.body;
    const coverImage = req.file ? req.file.path : "";

    // Validasi required fields
    const requiredFields = {
      nomor,
      judul,
      level,
      penulis,
      kodeJudul,
      kodePenulis,
    };
    const missingFields = Object.entries(requiredFields)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingFields.length > 0) {
      if (req.file) {
        await cloudinary.uploader.destroy(req.file.filename);
      }
      return responseHelper.validationError(res, {
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // Check duplicate book number
    const existingBook = await Book.findOne({ nomor });
    if (existingBook) {
      if (req.file) {
        await cloudinary.uploader.destroy(req.file.filename);
      }
      return responseHelper.error(res, "Book number already exist", 400);
    }

    const newData = new Book({
      nomor,
      judul,
      level,
      penulis,
      kodeJudul,
      kodePenulis,
      coverImage, // Cover image path
    });

    const savedData = await newData.save();
    res.status(201).json(savedData);
  } catch (error) {
    if (req.file) {
      await cloudinary.uploader.destroy(req.file.filename);
    }
    if (error.code === 11000) {
      return responseHelper.error(res, "Book already exists", 400);
    }
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return responseHelper.validationError(res, errors);
    }

    return responseHelper.error(res, "Internal server error", 500);
  }
};

exports.getAllBooks = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status = "all",
      level = "all",
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;
    console.log(search);

    const query = {};

    // Filter by status
    if (status && status !== "all") {
      query.status = status;
    }

    // Filter by level
    if (level && level !== "all") {
      query.level = level;
    }

    // Search in title, author, or book number
    if (search) {
      query.$or = [
        { judul: { $regex: search, $options: "i" } },
        { penulis: { $regex: search, $options: "i" } },
        { nomor: { $regex: search, $options: "i" } },
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const books = await Book.find(query)
      .populate("borrowedBy", "username email")
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .collation({ locale: "en", numericOrdering: true });

    const total = await Book.countDocuments();

    // Get book stats
    const totalAvailable = await Book.countDocuments({
      ...query,
      status: "available",
    });
    const totalBorrowed = await Book.countDocuments({
      ...query,
      status: "borrowed",
    });

    // Get unique levels for filter
    const levels = await Book.distinct("level");

    res.json({
      success: true,
      data: books,
      stats: {
        total,
        available: totalAvailable,
        borrowed: totalBorrowed,
      },
      levels: levels.filter((level) => level), // Remove null/undefined
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching books",
      error: error.message,
    });
  }
};

// Get book by ID with detailed information
exports.getBookId = async (req, res) => {
  try {
    const { id } = req.params;
    const book = await Book.findById(id).populate(
      "borrowedBy",
      "username email avatar",
    );

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    // Get borrowing due date
    const dueDate = await BorrowedBook.findOne({
      book: id,
      status: "borrowed",
    }).sort({ borrowedAt: -1 });

    // Get borrowing history for this book
    const borrowingHistory = await BorrowedBook.find({
      book: id,
    })
      .populate("user", "username email avatar")
      .sort({ borrowedAt: -1 })
      .limit(10);

    // if book never borrowed
    if (borrowingHistory.length === 0) {
      return res.json({
        success: true,
        data: {
          book,
        },
      });
    }

    res.json({
      success: true,
      data: {
        book,
        borrowingHistory,
        dueDate,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching book details",
      error: error.message,
    });
  }
};

// update Book
exports.updateBook = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);

    if (!book) {
      if (req.file) {
        await cloudinary.uploader.destroy(req.file.filename);
      }
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    // // Update other fields
    book.nomor = req.body.nomor || book.nomor;
    book.judul = req.body.judul || book.judul;
    book.level = req.body.level || book.level;
    book.penulis = req.body.penulis || book.penulis;
    book.kodeJudul = req.body.kodeJudul || book.kodeJudul;
    book.kodePenulis = req.body.kodePenulis || book.kodePenulis;

    // Check if new cover image is uploaded
    if (req.file) {
      // Delete the old cover image if it exists
      if (book.coverImage) {
        const publicId = book.coverImage.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(`library-books/${publicId}`);
      }
      book.coverImage = req.file.path;
    }

    await book.save();
    res.status(200).json(book);
  } catch (error) {
    // Delete uploaded file if error occurs
    if (req.file) {
      await cloudinary.uploader.destroy(req.file.filename);
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Book number already exists",
      });
    }
    res.status(500).json({
      success: false,
      message: "Error updating book",
      error: error.message,
    });
  }
};

// delete book
exports.deleteBook = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    // Check if book is currently borrowed
    if (book.status === "borrowed") {
      return res.status(400).json({
        success: false,
        message: "Tidak boleh menghapus buku yang sedang dipinjam",
      });
    }

    // Delete cover image from Cloudinary if exists
    if (book.coverImage) {
      const publicId = book.coverImage.split("/").pop().split(".")[0];
      await cloudinary.uploader.destroy(`library-books/${publicId}`);
    }

    await Book.findByIdAndDelete(req.params.id);
    await BorrowedBook.deleteMany({ book: req.params.id });

    res.json({
      success: true,
      message: "Book deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting book",
      error: error.message,
    });
  }
};
