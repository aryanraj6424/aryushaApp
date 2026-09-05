import express from "express";
import jwt from "jsonwebtoken";
import {
  getCategories,
  getSubCategoriesByCategory,
  getAllSubCategories,
  getProductFamiliesBySubCategory,
  getAllProductFamilies,
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  // Variant CRUD
  getVariantsByProduct,
  createVariant,
  updateVariant,
  deleteVariant,
  // Sub Category CRUD
  getSubCategoryById,
  createSubCategory,
  updateSubCategory,
  deleteSubCategory,
  // Product Family CRUD
  getProductFamilyById,
  createProductFamily,
  updateProductFamily,
  deleteProductFamily,
  approveProductFamily,
  rejectProductFamily,
  // Customer
  getCustomerProducts,
  getNearbyVendors,
  getProductReviews,
  addProductReview,
  checkReviewEligibility,
  seedFaridabadVendor
} from "../controllers/catalogController.js";
import { protectAdmin } from "../admin/middleware/adminAuthMiddleware.js";
import Admin from "../admin/models/Admin.js";
import Vendor from "../vendor/models/Vendor.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// Helper: protect routes for Admin or Vendor
const protectAdminOrVendor = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ success: false, message: "Unauthorized - No Token Provided" });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await Admin.findById(decoded.id).select("-password");
    if (admin) {
      req.admin = admin;
      return next();
    }

    const vendor = await Vendor.findById(decoded.id).select("-password");
    if (vendor) {
      if (vendor.status !== "approved" || vendor.accountStatus !== "active") {
        return res.status(403).json({ success: false, message: `Access Denied - Vendor Account status: ${vendor.status}` });
      }
      req.vendor = vendor;
      return next();
    }

    return res.status(401).json({ success: false, message: "Not Authorized" });
  } catch (error) {
    return res.status(401).json({ success: false, message: "Token Invalid or Expired" });
  }
};

/* ─────────────────────────────────────────────
   Public catalog routes
───────────────────────────────────────────── */
router.get("/categories", getCategories);
router.get("/sub-categories", getAllSubCategories);
router.get("/sub-categories/category/:categoryId", getSubCategoriesByCategory);
router.get("/product-families", getAllProductFamilies);
router.get("/product-families/sub-category/:subCategoryId", getProductFamiliesBySubCategory);
router.get("/products", getCustomerProducts);
router.get("/vendors/nearby", getNearbyVendors);
router.get("/products/:id/reviews", getProductReviews);
router.post("/products/:id/reviews", protect, addProductReview);
router.get("/products/:id/review-eligibility", protect, checkReviewEligibility);
router.get("/seed-faridabad-vendor", seedFaridabadVendor);

/* ─────────────────────────────────────────────
   Sub Category CRUD
───────────────────────────────────────────── */
router.get("/sub-categories/:id", getSubCategoryById);
router.post("/sub-categories", protectAdmin, createSubCategory);
router.put("/sub-categories/:id", protectAdmin, updateSubCategory);
router.delete("/sub-categories/:id", protectAdmin, deleteSubCategory);

/* ─────────────────────────────────────────────
   Product Family CRUD
───────────────────────────────────────────── */
router.get("/product-families/:id", getProductFamilyById);
router.post("/product-families", protectAdminOrVendor, createProductFamily);
router.put("/product-families/:id", protectAdminOrVendor, updateProductFamily);
router.delete("/product-families/:id", protectAdminOrVendor, deleteProductFamily);
router.put("/product-families/approve/:id", protectAdmin, approveProductFamily);
router.put("/product-families/reject/:id", protectAdmin, rejectProductFamily);

/* ─────────────────────────────────────────────
   Admin-only Product + Variant routes
───────────────────────────────────────────── */
router.use(protectAdmin);

// Product CRUD
router.get("/admin/product/all", getAllProducts);
router.get("/admin/product/:id", getProductById);
router.post("/admin/product/create", createProduct);
router.put("/admin/product/update/:id", updateProduct);
router.delete("/admin/product/delete/:id", deleteProduct);

// Variant CRUD (nested under product for list/create; standalone for update/delete)
router.get("/admin/product/:productId/variants", getVariantsByProduct);
router.post("/admin/product/:productId/variants", createVariant);
router.put("/admin/variant/:id", updateVariant);
router.delete("/admin/variant/:id", deleteVariant);

export default router;
