import express from "express";
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  updateCategoryStatus
} from "../controllers/categoryController.js";
import { protectAdmin } from "../admin/middleware/adminAuthMiddleware.js";

const router = express.Router();

// Public route - no authentication required for getting categories
router.get("/", getCategories);

// All other routes require admin authentication
router.use(protectAdmin);

// @route   GET /api/categories/:id
// @desc    Get single category by ID
router.get("/:id", getCategoryById);

// @route   POST /api/categories
// @desc    Create new category
router.post("/", createCategory);

// @route   PUT /api/categories/:id
// @desc    Update category
router.put("/:id", updateCategory);

// @route   DELETE /api/categories/:id
// @desc    Delete category
router.delete("/:id", deleteCategory);

// @route   PATCH /api/categories/:id/status
// @desc    Update category status
router.patch("/:id/status", updateCategoryStatus);

export default router;
