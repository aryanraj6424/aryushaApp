// import express from "express";
// import {
//   createAddress,
//   getUserAddresses,
// } from "../controllers/addressController.js";

// const router = express.Router();

// router.post(
//   "/create",
//   createAddress
// );

// router.get(
//   "/user/:userId",
//   getUserAddresses
// );

// router.delete(
//   "/:id",
//   deleteAddress
// );

// export default router;



import express from "express";
import protect from "../../middleware/authMiddleware.js";

import {
  createAddress,
  getUserAddresses,
  deleteAddress,
} from "../controllers/addressController.js";

const router = express.Router();

router.use(protect);

/*
|--------------------------------------------------------------------------
| Create Address
|--------------------------------------------------------------------------
*/

router.post(
  "/create",
  createAddress
);

/*
|--------------------------------------------------------------------------
| Get User Addresses
|--------------------------------------------------------------------------
*/

router.get(
  "/user/:userId",
  getUserAddresses
);

/*
|--------------------------------------------------------------------------
| Delete Address
|--------------------------------------------------------------------------
*/

router.delete(
  "/:id",
  deleteAddress
);

export default router;