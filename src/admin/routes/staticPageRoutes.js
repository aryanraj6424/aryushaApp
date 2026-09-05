import express from "express";
import {
  getStaticPageBySlug,
  updateStaticPage,
  getStaticPagesList,
  getCitiesServed
} from "../controllers/staticPageController.js";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";

const router = express.Router();

// Public routes (no auth required for customer footer display)
router.get("/pages/:slug", getStaticPageBySlug);
router.get("/cities", getCitiesServed);

// Admin protected routes (CMS controls)
router.use(protectAdmin);
router.get("/pages", getStaticPagesList);
router.put("/pages/:slug", updateStaticPage);

export default router;
