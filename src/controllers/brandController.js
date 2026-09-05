import { Brand } from "../models/catalog.js";

// @desc    Get all brands
// @route   GET /api/brands
// @access  Public
export const getBrands = async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = { isDeleted: { $ne: true } };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const brands = await Brand.find(query).sort({ name: 1 });
    res.status(200).json({ success: true, brands });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get brand by ID
// @route   GET /api/brands/:id
// @access  Public
export const getBrandById = async (req, res) => {
  try {
    const brand = await Brand.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!brand) {
      return res.status(404).json({ success: false, message: "Brand not found" });
    }
    res.status(200).json({ success: true, brand });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create new brand
// @route   POST /api/brands
// @access  Private/Admin
export const createBrand = async (req, res) => {
  try {
    const { name, description, image, status } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: "Brand name is required" });
    }

    const existing = await Brand.findOne({ name: name.trim(), isDeleted: { $ne: true } });
    if (existing) {
      return res.status(400).json({ success: false, message: "Brand already exists" });
    }

    const brand = await Brand.create({
      name: name.trim(),
      description,
      image,
      status: status || 'Active',
      createdBy: req.admin?._id
    });

    res.status(201).json({ success: true, brand });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update brand
// @route   PUT /api/brands/:id
// @access  Private/Admin
export const updateBrand = async (req, res) => {
  try {
    const { name, description, image, status } = req.body;
    const brand = await Brand.findOne({ _id: req.params.id, isDeleted: { $ne: true } });

    if (!brand) {
      return res.status(404).json({ success: false, message: "Brand not found" });
    }

    if (name && name.trim() !== brand.name) {
      const existing = await Brand.findOne({ name: name.trim(), isDeleted: { $ne: true } });
      if (existing) {
        return res.status(400).json({ success: false, message: "Brand name already exists" });
      }
      brand.name = name.trim();
    }

    brand.description = description !== undefined ? description : brand.description;
    brand.image = image !== undefined ? image : brand.image;
    brand.status = status || brand.status;
    brand.updatedBy = req.admin?._id;

    await brand.save();
    res.status(200).json({ success: true, brand });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete brand
// @route   DELETE /api/brands/:id
// @access  Private/Admin
export const deleteBrand = async (req, res) => {
  try {
    const brand = await Brand.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!brand) {
      return res.status(404).json({ success: false, message: "Brand not found" });
    }

    // Soft delete to avoid breaking historical products
    brand.isDeleted = true;
    brand.status = "Inactive";
    brand.updatedBy = req.admin?._id;
    await brand.save();

    res.status(200).json({ success: true, message: "Brand deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
