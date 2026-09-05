// import express from "express";

// import {
//   getPendingVendors,
//   approveVendor,
//   rejectVendor,
// } from "../controllers/vendorController.js";

// const router =
//   express.Router();

// router.get(
//   "/pending",
//   getPendingVendors
// );

// router.put(
//   "/approve/:id",
//   approveVendor
// );

// router.put(
//   "/reject/:id",
//   rejectVendor
// );

// export default router;


import express from "express";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";

import {
  getPendingVendors,
  approveVendor,
  rejectVendor,
  getVendorStats,
  getAllVendors,
  suspendVendor,
  activateVendor,
  holdVendor,
  deactivateVendor,
  assignVendorArea,
  updateVendorAccountStatus,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
  getVendorPermissions,
  updateVendorPermissions,
  updateVendorServiceArea,
} from "../controllers/vendorController.js";

const router =
  express.Router();

router.use(protectAdmin);

// Dashboard Stats
router.get(
  "/stats",
  getVendorStats
);

// All Vendors
router.get(
  "/all",
  getAllVendors
);

// Pending Vendors
router.get(
  "/pending",
  getPendingVendors
);

// Permissions endpoints (Admin)
router.get(
  "/permissions/:id",
  getVendorPermissions
);

router.put(
  "/permissions/:id",
  updateVendorPermissions
);

// CRUD endpoints (Admin)
router.post(
  "/",
  createVendor
);

router.get(
  "/:id",
  getVendorById
);

router.put(
  "/:id",
  updateVendor
);

router.delete(
  "/:id",
  deleteVendor
);

// Approval Actions
router.put(
  "/approve/:id",
  approveVendor
);

router.put(
  "/reject/:id",
  rejectVendor
);

// Account Control Actions
router.put(
  "/suspend/:id",
  suspendVendor
);

router.put(
  "/activate/:id",
  activateVendor
);

router.put(
  "/hold/:id",
  holdVendor
);

router.put(
  "/deactivate/:id",
  deactivateVendor
);

router.put(
  "/assign-area/:id",
  assignVendorArea
);

router.put(
  "/account-status/:id",
  updateVendorAccountStatus
);

router.put(
  "/:id/service-area",
  updateVendorServiceArea
);

export default router;