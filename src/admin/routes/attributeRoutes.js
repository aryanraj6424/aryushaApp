import express from "express";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";
import {
  getAttributes,
  getAttribute,
  createAttribute,
  updateAttribute,
  deleteAttribute,
} from "../controllers/attributeController.js";

const router = express.Router();

router.use(protectAdmin);

// Get all attributes
router.get("/all", getAttributes);

// Get single attribute
router.get("/:id", getAttribute);

// Create attribute
router.post("/create", createAttribute);

// Update attribute
router.put("/update/:id", updateAttribute);

// Delete attribute
router.delete("/delete/:id", deleteAttribute);

export default router;
