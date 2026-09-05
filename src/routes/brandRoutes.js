import express from "express";
import {
  getBrands,
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand
} from "../controllers/brandController.js";
import { protectAdmin } from "../admin/middleware/adminAuthMiddleware.js";

const router = express.Router();

// Public routes
router.get("/", getBrands);
router.get("/:id", getBrandById);

// Admin-only routes
router.use(protectAdmin);
router.post("/", createBrand);
router.put("/:id", updateBrand);
router.delete("/:id", deleteBrand);

export default router;
