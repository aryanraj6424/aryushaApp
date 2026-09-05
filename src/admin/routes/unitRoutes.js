import express from "express";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";
import {
  getUnits,
  getUnitById,
  createUnit,
  updateUnit,
  deleteUnit,
} from "../controllers/unitController.js";

const router = express.Router();

// Allow public GET for variant pickers, protect mutation routes with protectAdmin
router.get("/all", getUnits);
router.get("/", getUnits);
router.get("/:id", getUnitById);

router.post("/create", protectAdmin, createUnit);
router.post("/", protectAdmin, createUnit);

router.put("/update/:id", protectAdmin, updateUnit);
router.put("/:id", protectAdmin, updateUnit);

router.delete("/delete/:id", protectAdmin, deleteUnit);
router.delete("/:id", protectAdmin, deleteUnit);

export default router;
