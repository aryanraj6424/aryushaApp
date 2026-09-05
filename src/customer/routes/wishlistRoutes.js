import express from "express";
import protect from "../../middleware/authMiddleware.js";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist
} from "../controllers/wishlistController.js";

const router = express.Router();

// All customer wishlist endpoints are protected
router.use(protect);

router.get("/", getWishlist);
router.post("/:productId", addToWishlist);
router.delete("/:productId", removeFromWishlist);

export default router;
