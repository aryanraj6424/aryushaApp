import express from "express";
import { getSitemapXml } from "../controllers/sitemapController.js";

const router = express.Router();

router.get("/sitemap.xml", getSitemapXml);

export default router;
