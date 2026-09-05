import Banner from "../models/Banner.js";
import { Product } from "../../models/catalog.js";

// @desc    Get all banners (Admin)
// @route   GET /api/admin/banners
// @access  Private/Admin
export const getAllBanners = async (req, res) => {
  try {
    const banners = await Banner.find()
      .populate("productId", "name slug images")
      .populate("vendorId", "shopName address")
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, banners });
  } catch (error) {
    console.error("Get Banners Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Create banner
// @route   POST /api/admin/banners
// @access  Private/Admin
export const createBanner = async (req, res) => {
  try {
    const { image, productId, vendorId, isActive, startDate, endDate } = req.body;

    if (!image || !productId || !vendorId) {
      return res.status(400).json({
        success: false,
        message: "image, productId, and vendorId are required",
      });
    }

    // Fetch product slug for easy client-side navigation
    const product = await Product.findById(productId).select("slug name");
    const productSlug = product?.slug || "";

    const banner = await Banner.create({
      image,
      productId,
      productSlug,
      vendorId,
      isActive: isActive !== undefined ? isActive : true,
      startDate: startDate || null,
      endDate: endDate || null,
      createdBy: req.admin?._id,
    });

    const populated = await Banner.findById(banner._id)
      .populate("productId", "name slug images")
      .populate("vendorId", "shopName address");

    res.status(201).json({ success: true, banner: populated });
  } catch (error) {
    console.error("Create Banner Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Update banner
// @route   PUT /api/admin/banners/:id
// @access  Private/Admin
export const updateBanner = async (req, res) => {
  try {
    const { image, productId, vendorId, isActive, startDate, endDate } = req.body;

    const banner = await Banner.findById(req.params.id);
    if (!banner) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }

    if (image !== undefined) banner.image = image;
    if (productId !== undefined) {
      banner.productId = productId;
      const product = await Product.findById(productId).select("slug");
      banner.productSlug = product?.slug || "";
    }
    if (vendorId !== undefined) banner.vendorId = vendorId;
    if (isActive !== undefined) banner.isActive = isActive;
    if (startDate !== undefined) banner.startDate = startDate || null;
    if (endDate !== undefined) banner.endDate = endDate || null;

    await banner.save();

    const populated = await Banner.findById(banner._id)
      .populate("productId", "name slug images")
      .populate("vendorId", "shopName address");

    res.status(200).json({ success: true, banner: populated });
  } catch (error) {
    console.error("Update Banner Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Delete banner
// @route   DELETE /api/admin/banners/:id
// @access  Private/Admin
export const deleteBanner = async (req, res) => {
  try {
    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }
    res.status(200).json({ success: true, message: "Banner deleted successfully" });
  } catch (error) {
    console.error("Delete Banner Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get active banners for a vendor (Customer app)
// @route   GET /api/admin/banners/public?vendorId=xxx
// @access  Public
export const getActiveBannersForVendor = async (req, res) => {
  try {
    const { vendorId } = req.query;
    if (!vendorId) {
      return res.status(200).json({ success: true, banners: [] });
    }

    const now = new Date();

    // Build a query that matches:
    //  - the correct vendor
    //  - isActive = true
    //  - startDate is null OR startDate is in the past/now (banner has started)
    //  - endDate is null OR endDate is in the future/now (banner hasn't expired)
    const query = {
      vendorId,
      isActive: true,
      $and: [
        // startDate check: null means "no start restriction"
        {
          $or: [
            { startDate: null },
            { startDate: { $exists: false } },
            { startDate: { $lte: now } },
          ],
        },
        // endDate check: null means "no end restriction"
        {
          $or: [
            { endDate: null },
            { endDate: { $exists: false } },
            { endDate: { $gte: now } },
          ],
        },
      ],
    };

    const banners = await Banner.find(query)
      .populate("productId", "name slug images")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, banners });
  } catch (error) {
    console.error("Get Active Banners Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

