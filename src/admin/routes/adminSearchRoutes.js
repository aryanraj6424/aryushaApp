import express from "express";
import { searchAdminEntities } from "../controllers/adminSearchController.js";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";

const router = express.Router();

router.use(protectAdmin);

router.get("/", searchAdminEntities);

export default router;
