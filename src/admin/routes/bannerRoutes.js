import express from "express";
import {
  getAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  getActiveBannersForVendor,
} from "../controllers/bannerController.js";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";

const router = express.Router();

// Public — customer app fetches active banners by vendor
router.get("/public", getActiveBannersForVendor);

// Admin CRUD
router.get("/", protectAdmin, getAllBanners);
router.post("/", protectAdmin, createBanner);
router.put("/:id", protectAdmin, updateBanner);
router.delete("/:id", protectAdmin, deleteBanner);

export default router;
