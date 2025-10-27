const express = require("express");
const User = require("../models/UserModel");
const BorrowedBook = require("../models/BorrowedBook");
const responseHelper = require("../utils/responseHelper");
const cloudinary = require("cloudinary").v2;

// get user
exports.getUser = async (req, res) => {
  try {
    const users = await User.findById(req.user.id)
      .select("-password")
      .sort({ username: 1 });
    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// get all users
exports.getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      role = "all",
      search,
      sortBy = "createAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    // Filter by role
    if (role && role !== "all") {
      query.role = role;
    }

    // Search in username or email
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const users = await User.find(query)
      .select("-password")
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments();

    // Get user stats
    const totalAdmins = await User.countDocuments({ ...query, role: "admin" });
    const totalUsers = await User.countDocuments({ ...query, role: "user" });

    res.json({
      success: true,
      data: users,
      stats: {
        total,
        admin: totalAdmins,
        user: totalUsers,
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
      message: "Error fetching users",
      error: error.message,
    });
  }
};

// Get user by ID with detailed information
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get user's borrowed books
    const borrowedBooks = await BorrowedBook.find({
      user: req.params.id,
      status: "borrowed",
    })
      .populate("book", "nomor judul level penulis coverImage")
      .sort({ borrowedAt: -1 });

    // Get user's borrowing history
    const borrowingHistory = await BorrowedBook.find({
      user: req.params.id,
    })
      .populate("book", "nomor judul level penulis")
      .sort({ borrowedAt: -1 })
      .limit(10);

    // Get user statistics
    const totalBorrowed = await BorrowedBook.countDocuments({
      user: req.params.id,
    });
    const currentlyBorrowed = await BorrowedBook.countDocuments({
      user: req.params.id,
      status: "borrowed",
    });
    const totalReturned = await BorrowedBook.countDocuments({
      user: req.params.id,
      status: "returned",
    });

    res.json({
      success: true,
      data: {
        user,
        borrowedBooks,
        borrowingHistory: borrowingHistory.slice(0, 5),
        stats: {
          totalBorrowed,
          currentlyBorrowed,
          totalReturned,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching user details",
      error: error.message,
    });
  }
};

// put update user
exports.updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    // check if user exists
    if (!user) {
      if (req.file) {
        await cloudinary.uploader.destroy(req.file.filename);
      }
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // update user profile
    user.username = req.body.username || user.username;
    user.email = req.body.email || user.email;
    user.role = req.body.role || user.role;

    // check if new avatar is uploaded
    if (req.file) {
      //   // delete the old avatar if it exists
      if (user.avatar) {
        const publicId = user.avatar.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(`library-books/${publicId}`);
      }
      user.avatar = req.file.path;
    }

    if (req.body.password && req.body.password.trim() !== "") {
      user.password = req.body.password;
    }

    const updatedUser = await user.save();
    res.json(updatedUser);
  } catch (error) {
    if (req.file) {
      await cloudinary.uploader.destroy(req.file.filename);
    }
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Uusername or email",
      });
    }
    res.status(500).json({
      success: false,
      message: "failed update user",
      error: error.message,
    });
  }
};

// post create user
exports.createUser = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    const userExists = await User.findOne({ email });

    if (userExists) {
      if (req.file) {
        await cloudinary.uploader.destroy(req.file.filename);
      }
      return responseHelper.error(res, "Email already exists", 400);
    }

    if (!username || !email || !password || !role) {
      if (req.file) {
        await cloudinary.uploader.destroy(req.file.filename);
      }
      return responseHelper.validationError(res, "All fields are required");
    }

    const user = await User.create({
      username,
      email,
      password,
      role,
      avatar: req.file ? req.file.path : "",
    });

    responseHelper.success(res, "User created successfully", user);
  } catch (error) {
    if (req.file) {
      await cloudinary.uploader.destroy(req.file.filename);
    }

    responseHelper.error(res, error.message, 500);
  }
};

// delete user
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if user has borrowed books
    const borrowedBooks = await BorrowedBook.countDocuments({
      user: req.params.id,
      status: "borrowed",
    });

    if (borrowedBooks > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete user with borrowed books",
      });
    }

    // remove avatar after delete user
    if (user.avatar) {
      const publicId = user.avatar.split("/").pop().split(".")[0];
      await cloudinary.uploader.destroy(`library-books/${publicId}`);
    }

    // remove borrowed books after delete user
    await BorrowedBook.deleteMany({ user: req.params.id });

    await User.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting user",
      error: error.message,
    });
  }
};
