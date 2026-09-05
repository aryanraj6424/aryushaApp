import express from "express";
import { protectVendor } from "../middleware/vendorAuthMiddleware.js";
import {
  searchMasterProducts,
  createVendorProductReference,
  getMyLinkedProducts,
  updateLinkedProductDetails,
  unlinkProductFromStore,
  getCommissionPreview,
  getCommissionHistory
} from "../controllers/vendorProductsController.js";

import { getTopSellingProducts } from "../controllers/vendorProductController.js";

const router = express.Router();

router.use(protectVendor);

// Linked Master Products CRUD
router.get("/top-selling", getTopSellingProducts);
router.get("/search", searchMasterProducts);
router.get("/:productId/commission-preview", getCommissionPreview);
router.get("/link/:id/history", getCommissionHistory);
router.post("/", createVendorProductReference);
router.get("/my-links", getMyLinkedProducts);
router.put("/link/:id", updateLinkedProductDetails);
router.delete("/link/:id", unlinkProductFromStore);

export default router;
