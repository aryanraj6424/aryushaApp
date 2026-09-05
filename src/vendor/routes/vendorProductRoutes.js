import express from "express";
import {
  getVendorProducts,
  getVendorProductById,
  createVendorProduct,
  updateVendorProduct,
  deleteVendorProduct,
  bulkImportVendorProducts,
  bulkUpdateVendorProducts,
  bulkDeleteVendorProducts,
  exportVendorProducts,
  getTopSellingProducts
} from "../controllers/vendorProductController.js";
import {
  getVariantsByProduct,
  createVariant,
  updateVariant,
  deleteVariant
} from "../../controllers/catalogController.js";
import { protectVendor } from "../middleware/vendorAuthMiddleware.js";

const router = express.Router();

router.use(protectVendor);

// Product CRUD
router.get("/top-selling", getTopSellingProducts);
router.get("/all", getVendorProducts);
router.get("/:id", getVendorProductById);
router.post("/create", createVendorProduct);
router.put("/update/:id", updateVendorProduct);
router.delete("/delete/:id", deleteVendorProduct);

// Variant CRUD (same catalog variants, vendor-protected)
router.get("/:productId/variants", getVariantsByProduct);
router.post("/:productId/variants", createVariant);
router.put("/variant/:id", updateVariant);
router.delete("/variant/:id", deleteVariant);

// Bulk operations & export
router.post("/import", bulkImportVendorProducts);
router.post("/bulk-update", bulkUpdateVendorProducts);
router.post("/bulk-delete", bulkDeleteVendorProducts);
router.get("/export", exportVendorProducts);

export default router;
