const express = require("express");
const BorrowedBook = require("../models/BorrowedBook");
const User = require("../models/UserModel");
const Book = require("../models/BookModel");

exports.getDashboardStats = async (req, res) => {
  try {
    const { range = "7d" } = req.query;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let startDate, endDate;

    switch (range) {
      case "today":
        startDate = new Date(today);
        endDate = new Date();
        endDate.setDate(endDate.getDate() + 1);
        break;
      case "yesterday":
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 1);
        endDate = new Date(today);
        break;
      case "7d":
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 7);
        endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 1);
        break;
      case "30d":
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 30);
        endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 1);
        break;
      case "all":
        startDate = null;
        endDate = null;
        break;
      default:
        startDate = new Date(today);
        endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 1);
    }

    let borrowedQuery = {};
    let returnedQuery = { status: "returned" };

    if (startDate && endDate) {
      borrowedQuery.borrowedAt = { $gte: startDate, $lt: endDate };
      returnedQuery.borrowedAt = { $gte: startDate, $lt: endDate };
    }

    // Get borrowed books stats
    const borrowedCount = await BorrowedBook.countDocuments(borrowedQuery);
    const returnedCount = await BorrowedBook.countDocuments(returnedQuery);

    // Get total users and books
    const totalUsers = await User.countDocuments();
    const totalBooks = await Book.countDocuments();
    const availableBooks = await Book.countDocuments({ status: "available" });
    const borrowedBooks = await BorrowedBook.countDocuments({
      status: "borrowed",
    });

    // Get user roles distribution
    const userRoles = await User.aggregate([
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get daily data for chart (only for time-based periods)
    let dailyData = [];
    let monthlyData = [];

    if (range !== "all") {
      // Daily data for line/bar chart
      dailyData = await BorrowedBook.aggregate([
        {
          $match: borrowedQuery,
        },
        {
          $group: {
            _id: {
              date: {
                $dateToString: { format: "%Y-%m-%d", date: "$borrowedAt" },
              },
              status: "$status",
            },
            count: { $sum: 1 },
          },
        },
        {
          $sort: { "_id.date": 1 },
        },
      ]);
    } else {
      // for alltime range, get monthly data
      monthlyData = await BorrowedBook.aggregate([
        {
          $group: {
            _id: {
              month: {
                $dateToString: { format: "%Y-%m", date: "$borrowedAt" },
              },
              status: "$status",
            },
            count: { $sum: 1 },
          },
        },
        {
          $sort: { "_id.month": 1 },
        },
      ]);
    }

    // Get popular books (most borrowed)
    const popularBooks = await BorrowedBook.aggregate([
      {
        $match: { book: { $exists: true } },
      },
      {
        $group: {
          _id: "$book",
          borrowCount: { $sum: 1 },
        },
      },
      {
        $sort: { borrowedCount: -1 },
      },
      {
        $limit: 5,
      },
      {
        $lookup: {
          from: "books",
          localField: "_id",
          foreignField: "_id",
          as: "bookInfo",
        },
      },
      {
        $unwind: "$bookInfo",
      },
      {
        $project: {
          title: "$bookInfo.judul",
          level: "$bookInfo.level",
          borrowCount: 1,
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        range,
        borrowed: borrowedCount,
        returned: returnedCount,
        total: borrowedCount + returnedCount,
        users: {
          total: totalUsers,
          admin: userRoles.find((role) => role._id === "admin")?.count || 0,
          user: userRoles.find((role) => role._id === "user")?.count || 0,
        },
        books: {
          total: totalBooks,
          available: availableBooks,
          borrowed: borrowedBooks,
        },
        dailyData,
        monthlyData,
        popularBooks,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      massage: "Error fetching borrow stats",
      error: error.message,
    });
  }
};

// Get available range
exports.getRange = async (req, res) => {
  try {
    const range = [
      { value: "today", label: "Hari ini" },
      { value: "yesterday", label: "Kemarin" },
      { value: "7d", label: "7 Hari" },
      { value: "30d", label: "30 Hari" },
      { value: "all", label: "Semua" },
    ];

    res.json({
      success: true,
      data: range,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching range",
      error: error.message,
    });
  }
};

// Get all transactions (borrowed and returned) with pagination and filters
exports.getAllTransactions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status = "all",
      search,
      sortBy = "borrowedAt",
      sortOrder = "desc",
      dateFrom,
      dateTo,
    } = req.query;

    const query = {};

    // Filter by status
    if (status && status !== "all") {
      query.status = status;
    }

    // Filter by date range
    if (dateFrom || dateTo) {
      query.borrowedAt = {};
      if (dateFrom) {
        query.borrowedAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        query.borrowedAt.$lte = new Date(dateTo);
      }
    }

    // Search in book title, book number, or user username
    if (search) {
      const books = await Book.find({
        $or: [
          { judul: { $regex: search, $options: "i" } },
          { nomor: { $regex: search, $options: "i" } },
          { penulis: { $regex: search, $options: "i" } },
        ],
      }).select("_id");

      const users = await User.find({
        $or: [
          { username: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }).select("_id");

      query.$or = [
        { book: { $in: books.map((b) => b._id) } },
        { user: { $in: users.map((u) => u._id) } },
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const transactions = await BorrowedBook.find(query)
      .populate("book", "nomor judul level penulis kodeJudul kodePenulis")
      .populate("user", "username email avatar")
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await BorrowedBook.countDocuments(query);

    // Get stats for filter
    const totalBorrowed = await BorrowedBook.countDocuments({
      ...query,
      status: "borrowed",
    });
    const totalReturned = await BorrowedBook.countDocuments({
      ...query,
      status: "returned",
    });

    res.json({
      success: true,
      data: transactions,
      stats: {
        total,
        borrowed: totalBorrowed,
        returned: totalReturned,
      },
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
      message: "Error fetching transactions",
      error: error.message,
    });
  }
};

// get borrowed books by user id
exports.getBorrowedBooksByUserId = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status = "all",
      search,
      sortBy = "borrowedAt",
      sortOrder = "desc",
      dateFrom,
      dateTo,
    } = req.query;

    const query = { user: req.params.id };

    // Filter by status
    if (status && status !== "all") {
      query.status = status;
    }

    // Filter by date range
    if (dateFrom || dateTo) {
      query.borrowedAt = {};
      if (dateFrom) {
        query.borrowedAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        query.borrowedAt.$lte = new Date(dateTo);
      }
    }

    // Search in book title, book number, or user username
    if (search) {
      const books = await Book.find({
        $or: [
          { judul: { $regex: search, $options: "i" } },
          { nomor: { $regex: search, $options: "i" } },
          { penulis: { $regex: search, $options: "i" } },
        ],
      }).select("_id");

      query.$or = [{ book: { $in: books.map((b) => b._id) } }];
    }

    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const transactions = await BorrowedBook.find(query)
      .populate("book", "nomor judul level penulis kodeJudul kodePenulis")
      .populate("user", "username email avatar")
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await BorrowedBook.countDocuments(query);

    // Get stats for filter
    const totalBorrowed = await BorrowedBook.countDocuments({
      ...query,
      status: "borrowed",
    });
    const totalReturned = await BorrowedBook.countDocuments({
      ...query,
      status: "returned",
    });

    res.json({
      success: true,
      data: transactions,
      stats: {
        total,
        borrowed: totalBorrowed,
        returned: totalReturned,
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Borrow a book
exports.borrowBook = async (req, res) => {
  try {
    const { userId, dueDate } = req.body;
    const book = await Book.findById(req.params.id);
    const user = await User.findById(userId);

    const borrowedDate = new Date();
    const defaultDate = new Date(
      borrowedDate.getTime() + 7 * 24 * 60 * 60 * 1000,
    );
    const finalDueDate = dueDate ? new Date(dueDate) : defaultDate;

    const now = new Date();
    if (finalDueDate < now) {
      return res
        .status(400)
        .json({ message: "Due date cannot be in the past" });
    }

    if (!userId) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (book.status === "borrowed") {
      return res.status(400).json({ message: "Book is already borrowed" });
    }

    book.status = "borrowed";
    book.borrowedBy = userId;
    const borrowedBook = new BorrowedBook({
      user: userId,
      book: book._id,
      status: "borrowed",
      borrowedAt: borrowedDate,
      dueDate: finalDueDate,
    });

    const savedBorrowedBook = await borrowedBook.save();
    const updatedBook = await book.save();
    res.status(201).json({ savedBorrowedBook, updatedBook });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Return a book
exports.returnBook = async (req, res) => {
  try {
    const { id } = req.params;
    const book = await Book.findById(id);

    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    if (book.status === "available") {
      return res.status(400).json({ message: "Book is already available" });
    }
    const borrowedBook = await BorrowedBook.findOne({
      book: req.params.id,
      status: "borrowed",
    });

    if (borrowedBook) {
      borrowedBook.status = "returned";
      borrowedBook.returnedAt = new Date();
      await borrowedBook.save();
    }

    book.status = "available";
    book.borrowedBy = null;
    await book.save();

    const populatedBook = await Book.findById(id);

    res.json({
      success: true,
      message: "Book returned successfully",
      data: populatedBook,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
