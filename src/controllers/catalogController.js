import mongoose from "mongoose";
import {
  Category,
  SubCategory,
  ProductFamily,
  Product,
  ProductVariant,
  VendorListing,
  VendorProduct,
  ProductReview
} from "../models/catalog.js";
import Vendor from "../vendor/models/Vendor.js";
import CustomerOrder from "../customer/models/CustomerOrder.js";
import User from "../customer/models/User.js";

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public
export const getCategories = async (req, res) => {
  try {
    const categories = await Category.find({ status: 'active', isDeleted: { $ne: true } })
      .populate({ path: 'subCategories', select: '_id' })
      .populate({ path: 'productFamilies', select: '_id' })
      .populate({ path: 'products', select: '_id' })
      .sort({ sortOrder: 1 });
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all subcategories
// @route   GET /api/sub-categories
// @access  Public
export const getAllSubCategories = async (req, res) => {
  try {
    const subCategories = await SubCategory.find({ isDeleted: { $ne: true } })
      .populate('categoryId', 'name')
      .populate({ path: 'productFamilies', select: '_id' })
      .populate({ path: 'products', select: '_id' })
      .sort({ sortOrder: 1 });
    res.json({ subCategories });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get subcategories by category
// @route   GET /api/sub-categories/category/:categoryId
// @access  Public
export const getSubCategoriesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const subCategories = await SubCategory.find({ 
      categoryId, 
      status: 'active',
      isDeleted: { $ne: true }
    })
      .populate({ path: 'productFamilies', select: '_id' })
      .populate({ path: 'products', select: '_id' })
      .sort({ sortOrder: 1 });
    res.json({ subCategories });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all product families
// @route   GET /api/product-families
// @access  Public
export const getAllProductFamilies = async (req, res) => {
  try {
    const productFamilies = await ProductFamily.find({ isDeleted: { $ne: true } })
      .populate('categoryId', 'name')
      .populate('subCategoryId', 'name')
      .populate({ path: 'products', select: '_id' })
      .sort({ sortOrder: 1 });
    res.json({ productFamilies });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get product families by subcategory
// @route   GET /api/product-families/sub-category/:subCategoryId
// @access  Public
export const getProductFamiliesBySubCategory = async (req, res) => {
  try {
    const { subCategoryId } = req.params;
    const productFamilies = await ProductFamily.find({ 
      subCategoryId, 
      status: 'active',
      isDeleted: { $ne: true }
    })
      .populate({ path: 'products', select: '_id' })
      .sort({ sortOrder: 1 });
    res.json({ productFamilies });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all products
// @route   GET /api/admin/product/all
// @access  Private/Admin
export const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find()
      .populate('categoryId', 'name')
      .populate('subCategoryId', 'name')
      .populate('familyId', 'name')
      .sort({ createdAt: -1 });
    res.json({ products });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single product
// @route   GET /api/admin/product/:id
// @access  Private/Admin
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const query = isObjectId ? { $or: [{ _id: id }, { slug: id }] } : { slug: id };

    const product = await Product.findOne(query)
      .populate('categoryId', 'name slug')
      .populate('subCategoryId', 'name slug')
      .populate('familyId', 'name slug')
      .populate('variants');
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    res.json({ product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create new product
// @route   POST /api/admin/product/create
// @access  Private/Admin
export const createProduct = async (req, res) => {
  try {
    const {
      name,
      brand,
      categoryId,
      subCategoryId,
      familyId,
      unitType,
      description,
      images,
      isReturnable,
      shelfLifeDays,
      status
    } = req.body;

    if (!name || !categoryId || !subCategoryId || !familyId || !unitType) {
      return res.status(400).json({ message: 'name, categoryId, subCategoryId, familyId and unitType are required' });
    }

    const product = await Product.create({
      name,
      brand: brand || '',
      categoryId,
      subCategoryId,
      familyId,
      unitType: String(unitType).toLowerCase(),
      description: description || '',
      images: images || [],
      isReturnable: isReturnable || false,
      shelfLifeDays: shelfLifeDays || undefined,
      status: status || 'draft',
      createdBy: req.admin?._id,
      creatorModel: 'Admin'
    });

    const populated = await Product.findById(product._id)
      .populate('categoryId', 'name')
      .populate('subCategoryId', 'name')
      .populate('familyId', 'name');

    res.status(201).json({ product: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update product
// @route   PUT /api/admin/product/update/:id
// @access  Private/Admin
export const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const {
      name,
      brand,
      categoryId,
      subCategoryId,
      familyId,
      unitType,
      description,
      status
    } = req.body;

    product.name = name || product.name;
    product.brand = brand || product.brand;
    product.categoryId = categoryId || product.categoryId;
    product.subCategoryId = subCategoryId || product.subCategoryId;
    product.familyId = familyId || product.familyId;
    product.unitType = unitType ? String(unitType).toLowerCase() : product.unitType;
    product.description = description !== undefined ? description : product.description;
    product.status = status || product.status;

    await product.save();

    const populatedProduct = await Product.findById(product._id)
      .populate('categoryId', 'name')
      .populate('subCategoryId', 'name')
      .populate('familyId', 'name');

    res.json({ product: populatedProduct });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete product
// @route   DELETE /api/admin/product/delete/:id
// @access  Private/Admin
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Delete associated variants
    await ProductVariant.deleteMany({ productId: req.params.id });
    
    // Delete product
    await Product.deleteOne({ _id: req.params.id });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* ============================================================================
 * PRODUCT VARIANTS CRUD
 * ========================================================================= */

// @desc    Get all variants for a product
// @route   GET /api/admin/product/:productId/variants
// @access  Private/Admin
export const getVariantsByProduct = async (req, res) => {
  try {
    const variants = await ProductVariant.find({ productId: req.params.productId })
      .sort({ createdAt: 1 });
    res.json({ variants });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a variant for a product
// @route   POST /api/admin/product/:productId/variants
// @access  Private/Admin
export const createVariant = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const { variantLabel, packSize, sku, barcode, mrp, basePrice, images, status } = req.body;

    if (!variantLabel || !packSize?.value || !packSize?.unit || !sku || !mrp || !basePrice) {
      return res.status(400).json({ message: 'variantLabel, packSize (value+unit), sku, mrp and basePrice are required' });
    }

    // Ensure SKU is unique
    const existingSku = await ProductVariant.findOne({ sku: sku.toUpperCase().trim() });
    if (existingSku) return res.status(400).json({ message: 'SKU already exists' });

    const variant = await ProductVariant.create({
      productId,
      variantLabel: variantLabel.trim(),
      packSize: { value: Number(packSize.value), unit: packSize.unit },
      sku: sku.toUpperCase().trim(),
      barcode: barcode || '',
      mrp: Number(mrp),
      basePrice: Number(basePrice),
      images: images || [],
      status: status || 'active',
      createdBy: req.admin?._id
    });

    res.status(201).json({ variant });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a variant
// @route   PUT /api/admin/variant/:id
// @access  Private/Admin
export const updateVariant = async (req, res) => {
  try {
    const variant = await ProductVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: 'Variant not found' });

    const { variantLabel, packSize, sku, barcode, mrp, basePrice, images, status } = req.body;

    if (sku && sku.toUpperCase().trim() !== variant.sku) {
      const existingSku = await ProductVariant.findOne({ sku: sku.toUpperCase().trim(), _id: { $ne: variant._id } });
      if (existingSku) return res.status(400).json({ message: 'SKU already exists' });
      variant.sku = sku.toUpperCase().trim();
    }

    if (variantLabel) variant.variantLabel = variantLabel.trim();
    if (packSize?.value) variant.packSize.value = Number(packSize.value);
    if (packSize?.unit) variant.packSize.unit = packSize.unit;
    if (barcode !== undefined) variant.barcode = barcode;
    if (mrp) variant.mrp = Number(mrp);
    if (basePrice) variant.basePrice = Number(basePrice);
    if (images !== undefined) variant.images = images;
    if (status) variant.status = status;

    await variant.save();
    res.json({ variant });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a variant
// @route   DELETE /api/admin/variant/:id
// @access  Private/Admin
export const deleteVariant = async (req, res) => {
  try {
    const variant = await ProductVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: 'Variant not found' });
    await ProductVariant.deleteOne({ _id: req.params.id });
    res.json({ message: 'Variant deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* ============================================================================
 * SUB CATEGORIES CRUD
 * ========================================================================= */

// @desc    Get single subcategory
// @route   GET /api/sub-categories/:id
// @access  Public
export const getSubCategoryById = async (req, res) => {
  try {
    const subCategory = await SubCategory.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .populate("categoryId", "name");
    
    if (!subCategory) {
      return res.status(404).json({ message: 'Subcategory not found' });
    }
    
    res.json(subCategory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create subcategory
// @route   POST /api/sub-categories
// @access  Private/Admin
export const createSubCategory = async (req, res) => {
  try {
    const {
      categoryId,
      name,
      description,
      image,
      sortOrder,
      status,
      slug,
      metaTitle,
      metaDescription,
      canonicalUrl,
      ogImage
    } = req.body;
    
    if (!categoryId || !name) {
      return res.status(400).json({ message: 'Category ID and Name are required' });
    }

    const parentCat = await Category.findOne({ _id: categoryId, isDeleted: { $ne: true } });
    if (!parentCat) {
      return res.status(400).json({ message: 'Parent Category does not exist' });
    }

    const existing = await SubCategory.findOne({ categoryId, name: name.trim(), isDeleted: { $ne: true } });
    if (existing) {
      return res.status(400).json({ message: 'Subcategory name already exists under this category' });
    }

    // Slug validation unique under parent category
    const slugVal = slug ? slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const slugExists = await SubCategory.findOne({ categoryId, slug: slugVal, isDeleted: { $ne: true } });
    if (slugExists) {
      return res.status(400).json({ message: 'URL Slug is already in use by another subcategory under this category' });
    }

    // SEO fallbacks
    let fallbackMetaTitle = metaTitle ? metaTitle.trim() : name.trim();
    if (fallbackMetaTitle.length > 60) fallbackMetaTitle = fallbackMetaTitle.slice(0, 60);

    let fallbackMetaDesc = metaDescription ? metaDescription.trim() : (description ? description.trim() : name.trim());
    if (fallbackMetaDesc.length > 160) fallbackMetaDesc = fallbackMetaDesc.slice(0, 160);

    const subCategory = await SubCategory.create({
      categoryId,
      name: name.trim(),
      slug: slugVal,
      description,
      image,
      sortOrder: sortOrder || 0,
      status: status || 'active',
      metaTitle: fallbackMetaTitle,
      metaDescription: fallbackMetaDesc,
      canonicalUrl: canonicalUrl || "",
      ogImage: ogImage || "",
      createdBy: req.admin?._id
    });

    const populated = await SubCategory.findById(subCategory._id).populate("categoryId", "name");
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update subcategory
// @route   PUT /api/sub-categories/:id
// @access  Private/Admin
export const updateSubCategory = async (req, res) => {
  try {
    const {
      categoryId,
      name,
      description,
      image,
      sortOrder,
      status,
      slug,
      metaTitle,
      metaDescription,
      canonicalUrl,
      ogImage
    } = req.body;
    
    const subCategory = await SubCategory.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!subCategory) {
      return res.status(404).json({ message: 'Subcategory not found' });
    }

    const catId = categoryId || subCategory.categoryId;
    if (categoryId) {
      const parentCat = await Category.findOne({ _id: categoryId, isDeleted: { $ne: true } });
      if (!parentCat) {
        return res.status(400).json({ message: 'Parent Category does not exist' });
      }
      subCategory.categoryId = categoryId;
    }

    if (name && name.trim() !== subCategory.name) {
      const existing = await SubCategory.findOne({ categoryId: catId, name: name.trim(), isDeleted: { $ne: true } });
      if (existing) {
        return res.status(400).json({ message: 'Subcategory name already exists under this category' });
      }
      subCategory.name = name.trim();
    }

    // Slug validation unique under parent category
    if (slug) {
      const slugVal = slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const slugExists = await SubCategory.findOne({ categoryId: catId, slug: slugVal, _id: { $ne: req.params.id }, isDeleted: { $ne: true } });
      if (slugExists) {
        return res.status(400).json({ message: 'URL Slug is already in use by another subcategory under this category' });
      }
      subCategory.slug = slugVal;
    }

    // SEO fallbacks
    let fallbackMetaTitle = metaTitle ? metaTitle.trim() : (name ? name.trim() : subCategory.name);
    if (fallbackMetaTitle.length > 60) fallbackMetaTitle = fallbackMetaTitle.slice(0, 60);

    let fallbackMetaDesc = metaDescription ? metaDescription.trim() : (description ? description.trim() : (subCategory.description || subCategory.name));
    if (fallbackMetaDesc.length > 160) fallbackMetaDesc = fallbackMetaDesc.slice(0, 160);

    subCategory.description = description !== undefined ? description : subCategory.description;
    subCategory.image = image !== undefined ? image : subCategory.image;
    subCategory.sortOrder = sortOrder !== undefined ? sortOrder : subCategory.sortOrder;
    subCategory.status = status || subCategory.status;
    subCategory.metaTitle = fallbackMetaTitle;
    subCategory.metaDescription = fallbackMetaDesc;
    subCategory.canonicalUrl = canonicalUrl !== undefined ? canonicalUrl : subCategory.canonicalUrl;
    subCategory.ogImage = ogImage !== undefined ? ogImage : subCategory.ogImage;
    subCategory.updatedBy = req.admin?._id;

    await subCategory.save();

    const populated = await SubCategory.findById(subCategory._id).populate("categoryId", "name");
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete subcategory
// @route   DELETE /api/sub-categories/:id
// @access  Private/Admin
export const deleteSubCategory = async (req, res) => {
  try {
    const subCategory = await SubCategory.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!subCategory) {
      return res.status(404).json({ message: 'Subcategory not found' });
    }

    const productCount = await Product.countDocuments({ subCategoryId: req.params.id, isDeleted: { $ne: true } });
    if (productCount > 0) {
      subCategory.status = 'inactive';
      subCategory.isDeleted = true;
      await subCategory.save();
      return res.json({ message: 'Subcategory is in use by products; soft deleted (marked inactive)', success: true, subCategory });
    }

    await SubCategory.deleteOne({ _id: req.params.id });
    res.json({ message: 'Subcategory deleted successfully', success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* ============================================================================
 * PRODUCT FAMILIES CRUD
 * ========================================================================= */

// @desc    Get single product family
// @route   GET /api/product-families/:id
// @access  Public
export const getProductFamilyById = async (req, res) => {
  try {
    const family = await ProductFamily.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .populate("categoryId", "name")
      .populate("subCategoryId", "name")
      .populate("unitId");
    
    if (!family) {
      return res.status(404).json({ message: 'Product family not found' });
    }
    
    res.json(family);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create product family
// @route   POST /api/product-families
// @access  Private (Admin or Vendor)
export const createProductFamily = async (req, res) => {
  try {
    const {
      subCategoryId,
      brandId,
      name,
      description,
      shortDescription,
      image,
      images,
      tags,
      unitType,
      unitId,
      shelfLife,
      storageInstructions,
      countryOfOrigin,
      fssaiLicenseNumber,
      sortOrder,
      status,
      slug,
      metaTitle,
      metaDescription,
      canonicalUrl,
      ogImage,
      searchKeywords,
      structuredDataType
    } = req.body;
    
    if (!subCategoryId || !name) {
      return res.status(400).json({ message: 'Subcategory ID and Name are required' });
    }

    const subCat = await SubCategory.findOne({ _id: subCategoryId, isDeleted: { $ne: true } });
    if (!subCat) {
      return res.status(400).json({ message: 'Parent Subcategory does not exist' });
    }

    const existing = await ProductFamily.findOne({ subCategoryId, name: name.trim(), isDeleted: { $ne: true } });
    if (existing) {
      return res.status(400).json({ message: 'Product Family name already exists under this subcategory' });
    }

    // Slug validation unique under parent subcategory
    const slugVal = slug ? slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const slugExists = await ProductFamily.findOne({ subCategoryId, slug: slugVal, isDeleted: { $ne: true } });
    if (slugExists) {
      return res.status(400).json({ message: 'URL Slug is already in use by another product family under this subcategory' });
    }

    // SEO fallbacks
    let fallbackMetaTitle = metaTitle ? metaTitle.trim() : name.trim();
    if (fallbackMetaTitle.length > 60) fallbackMetaTitle = fallbackMetaTitle.slice(0, 60);

    let fallbackMetaDesc = metaDescription ? metaDescription.trim() : (description ? description.trim() : name.trim());
    if (fallbackMetaDesc.length > 160) fallbackMetaDesc = fallbackMetaDesc.slice(0, 160);

    // Determine creator
    const creatorId = req.admin?._id || req.vendor?._id;
    const creatorModel = req.admin ? "Admin" : "Vendor";
    const approvalStatus = req.admin ? "approved" : "pending";

    const family = await ProductFamily.create({
      subCategoryId,
      categoryId: subCat.categoryId,
      brandId: brandId || null,
      name: name.trim(),
      slug: slugVal,
      description,
      shortDescription: shortDescription || "",
      image,
      images: images || [],
      tags: tags || [],
      unitType: unitType || "",
      unitId: unitId || null,
      shelfLife: shelfLife || "",
      storageInstructions: storageInstructions || "",
      countryOfOrigin: countryOfOrigin || "",
      fssaiLicenseNumber: fssaiLicenseNumber || "",
      sortOrder: sortOrder || 0,
      status: status || 'draft',
      approvalStatus,
      metaTitle: fallbackMetaTitle,
      metaDescription: fallbackMetaDesc,
      canonicalUrl: canonicalUrl || "",
      ogImage: ogImage || "",
      searchKeywords: searchKeywords || [],
      structuredDataType: structuredDataType || "",
      createdBy: creatorId,
      creatorModel,
      approvalHistory: [
        {
          status: approvalStatus,
          updatedBy: creatorId,
          remarks: req.admin ? "Auto-approved (Admin created)" : "Submitted for Admin approval",
          updatedAt: new Date()
        }
      ]
    });

    const populated = await ProductFamily.findById(family._id)
      .populate("categoryId", "name")
      .populate("subCategoryId", "name")
      .populate("brandId", "name")
      .populate("unitId");
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update product family
// @route   PUT /api/product-families/:id
// @access  Private (Admin or Vendor)
export const updateProductFamily = async (req, res) => {
  try {
    const {
      subCategoryId,
      brandId,
      name,
      description,
      shortDescription,
      image,
      images,
      tags,
      unitType,
      unitId,
      shelfLife,
      storageInstructions,
      countryOfOrigin,
      fssaiLicenseNumber,
      sortOrder,
      status,
      slug,
      metaTitle,
      metaDescription,
      canonicalUrl,
      ogImage,
      searchKeywords,
      structuredDataType
    } = req.body;
    
    const family = await ProductFamily.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!family) {
      return res.status(404).json({ message: 'Product family not found' });
    }

    // Vendor permission: can only edit if it is their own requested family
    if (req.vendor && (family.creatorModel !== "Vendor" || family.createdBy.toString() !== req.vendor._id.toString())) {
      return res.status(403).json({ message: 'Access Denied: You cannot modify this product family' });
    }

    const subCatId = subCategoryId || family.subCategoryId;
    if (subCategoryId) {
      const subCat = await SubCategory.findOne({ _id: subCategoryId, isDeleted: { $ne: true } });
      if (!subCat) {
        return res.status(400).json({ message: 'Parent Subcategory does not exist' });
      }
      family.subCategoryId = subCategoryId;
      family.categoryId = subCat.categoryId;
    }

    if (name && name.trim() !== family.name) {
      const existing = await ProductFamily.findOne({ subCategoryId: subCatId, name: name.trim(), isDeleted: { $ne: true } });
      if (existing) {
        return res.status(400).json({ message: 'Product Family name already exists under this subcategory' });
      }
      family.name = name.trim();
    }

    // Slug validation unique under parent subcategory
    if (slug) {
      const slugVal = slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const slugExists = await ProductFamily.findOne({ subCategoryId: subCatId, slug: slugVal, _id: { $ne: req.params.id }, isDeleted: { $ne: true } });
      if (slugExists) {
        return res.status(400).json({ message: 'URL Slug is already in use by another product family under this subcategory' });
      }
      family.slug = slugVal;
    }

    // SEO fallbacks
    let fallbackMetaTitle = metaTitle ? metaTitle.trim() : (name ? name.trim() : family.name);
    if (fallbackMetaTitle.length > 60) fallbackMetaTitle = fallbackMetaTitle.slice(0, 60);

    let fallbackMetaDesc = metaDescription ? metaDescription.trim() : (description ? description.trim() : (family.description || family.name));
    if (fallbackMetaDesc.length > 160) fallbackMetaDesc = fallbackMetaDesc.slice(0, 160);

    family.brandId = brandId !== undefined ? (brandId || null) : family.brandId;
    family.unitId = unitId !== undefined ? (unitId || null) : family.unitId;
    family.description = description !== undefined ? description : family.description;
    family.shortDescription = shortDescription !== undefined ? shortDescription : family.shortDescription;
    family.image = image !== undefined ? image : family.image;
    family.images = images !== undefined ? images : family.images;
    family.tags = tags !== undefined ? tags : family.tags;
    family.unitType = unitType !== undefined ? unitType : family.unitType;
    family.shelfLife = shelfLife !== undefined ? shelfLife : family.shelfLife;
    family.storageInstructions = storageInstructions !== undefined ? storageInstructions : family.storageInstructions;
    family.countryOfOrigin = countryOfOrigin !== undefined ? countryOfOrigin : family.countryOfOrigin;
    family.fssaiLicenseNumber = fssaiLicenseNumber !== undefined ? fssaiLicenseNumber : family.fssaiLicenseNumber;
    family.sortOrder = sortOrder !== undefined ? sortOrder : family.sortOrder;
    family.status = status || family.status;
    family.metaTitle = fallbackMetaTitle;
    family.metaDescription = fallbackMetaDesc;
    family.canonicalUrl = canonicalUrl !== undefined ? canonicalUrl : family.canonicalUrl;
    family.ogImage = ogImage !== undefined ? ogImage : family.ogImage;
    family.searchKeywords = searchKeywords !== undefined ? searchKeywords : family.searchKeywords;
    family.structuredDataType = structuredDataType !== undefined ? structuredDataType : family.structuredDataType;
    family.updatedBy = req.admin?._id || req.vendor?._id;

    // Reset approval if vendor edits it
    if (req.vendor) {
      family.approvalStatus = "pending";
      family.approvalHistory.push({
        status: "pending",
        updatedBy: req.vendor._id,
        remarks: "Resubmitted due to vendor modifications",
        updatedAt: new Date()
      });
    }

    await family.save();

    const populated = await ProductFamily.findById(family._id)
      .populate("categoryId", "name")
      .populate("subCategoryId", "name")
      .populate("brandId", "name");
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete product family
// @route   DELETE /api/product-families/:id
// @access  Private (Admin or Vendor)
export const deleteProductFamily = async (req, res) => {
  try {
    const family = await ProductFamily.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!family) {
      return res.status(404).json({ message: 'Product family not found' });
    }

    // Vendor checks
    if (req.vendor && (family.creatorModel !== "Vendor" || family.createdBy.toString() !== req.vendor._id.toString())) {
      return res.status(403).json({ message: 'Access Denied: You cannot delete this product family' });
    }

    const productCount = await Product.countDocuments({ familyId: req.params.id, isDeleted: { $ne: true } });
    if (productCount > 0) {
      family.status = 'inactive';
      family.isDeleted = true;
      await family.save();
      return res.json({ message: 'Product Family is in use by products; soft deleted (marked inactive)', success: true, family });
    }

    await ProductFamily.deleteOne({ _id: req.params.id });
    res.json({ message: 'Product Family deleted successfully', success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Approve product family
// @route   PUT /api/product-families/approve/:id
// @access  Private/Admin
export const approveProductFamily = async (req, res) => {
  try {
    const { remarks } = req.body;
    const family = await ProductFamily.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!family) {
      return res.status(404).json({ message: 'Product family not found' });
    }

    family.approvalStatus = "approved";
    family.status = "active";
    family.approvalHistory.push({
      status: "approved",
      updatedBy: req.admin._id,
      remarks: remarks || "Approved by Admin",
      updatedAt: new Date()
    });

    await family.save();

    const populated = await ProductFamily.findById(family._id)
      .populate("categoryId", "name")
      .populate("subCategoryId", "name");
    res.json({ message: 'Product Family approved successfully', success: true, family: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reject product family
// @route   PUT /api/product-families/reject/:id
// @access  Private/Admin
export const rejectProductFamily = async (req, res) => {
  try {
    const { remarks } = req.body;
    const family = await ProductFamily.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!family) {
      return res.status(404).json({ message: 'Product family not found' });
    }

    family.approvalStatus = "rejected";
    family.status = "inactive";
    family.approvalHistory.push({
      status: "rejected",
      updatedBy: req.admin._id,
      remarks: remarks || "Rejected by Admin",
      updatedAt: new Date()
    });

    await family.save();

    const populated = await ProductFamily.findById(family._id)
      .populate("categoryId", "name")
      .populate("subCategoryId", "name");
    res.json({ message: 'Product Family rejected successfully', success: true, family: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================================
// CUSTOMER PRODUCTS LISTING & FILTERING WITH SERVICE AREA CONTROLS
// ============================================================================

const deg2rad = (deg) => {
  return deg * (Math.PI / 180);
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth radius in KM
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in KM
};

// @desc    Get filtered products for customer based on location/pincode
// @route   GET /api/products
// @access  Public
export const getCustomerProducts = async (req, res) => {
  try {
    const {
      pincode,
      latitude,
      longitude,
      search,
      category,
      subCategory,
      productFamily,
      brand,
      minPrice,
      maxPrice,
      availability
    } = req.query;

    let nearestVendor = null;
    let minDistance = Infinity;
    let servingVendorIds = [];

    if (latitude && longitude) {
      const latVal = parseFloat(latitude);
      const lngVal = parseFloat(longitude);
      if (!isNaN(latVal) && !isNaN(lngVal)) {
        const nearbyVendors = await Vendor.aggregate([
          {
            $geoNear: {
              near: { type: "Point", coordinates: [lngVal, latVal] },
              distanceField: "distance", // in meters
              spherical: true,
              query: { status: "approved", accountStatus: "active" }
            }
          },
          {
            $project: {
              shopName: 1,
              shopType: 1,
              phone: 1,
              businessEmail: 1,
              ownerDetails: 1,
              storeDetails: 1,
              address: 1,
              latitude: 1,
              longitude: 1,
              deliveryRadius: 1,
              radiusKm: 1,
              assignedRadius: 1,
              status: 1,
              accountStatus: 1,
              creatorModel: 1,
              createdBy: 1,
              distanceKm: { $divide: ["$distance", 1000] }
            }
          },
          {
            $match: {
              $expr: {
                $lte: ["$distanceKm", { $ifNull: ["$radiusKm", { $ifNull: ["$deliveryRadius", { $ifNull: ["$assignedRadius", 5] }] }] }]
              }
            }
          },
          {
            $sort: { distanceKm: 1 }
          }
        ]);

        if (nearbyVendors && nearbyVendors.length > 0) {
          servingVendorIds = nearbyVendors.map(v => v._id);
          nearestVendor = nearbyVendors[0];
          minDistance = nearbyVendors[0].distanceKm;
        }
      }
    }

    // Fallback: search by pincode if coordinates did not yield a vendor, or weren't provided
    if (servingVendorIds.length === 0 && pincode) {
      const activeVendors = await Vendor.find({
        status: "approved",
        accountStatus: "active"
      });

      const hasCoords = Boolean(latitude && longitude && !isNaN(parseFloat(latitude)) && !isNaN(parseFloat(longitude)));
      const custLat = hasCoords ? parseFloat(latitude) : null;
      const custLng = hasCoords ? parseFloat(longitude) : null;

      const servingVendors = activeVendors.filter((vendor) => {
        const servesPincodeRoot = (vendor.serviceAreas || []).some((sa) => sa.pincode === pincode);
        const servesPincodeDetails = (vendor.storeDetails?.serviceAreas || []).includes(pincode);
        const isHomePincode = vendor.address?.pincode === pincode || vendor.storeDetails?.pincode === pincode;
        const isAssignedArea = vendor.assignedArea === pincode;
        const pincodeMatch = servesPincodeRoot || servesPincodeDetails || isHomePincode || isAssignedArea;

        if (!pincodeMatch) return false;

        // If customer coordinates are available, enforce vendor delivery radius validation
        if (hasCoords && vendor.latitude !== null && vendor.latitude !== undefined && vendor.longitude !== null && vendor.longitude !== undefined) {
          const vLat = Number(vendor.latitude);
          const vLng = Number(vendor.longitude);
          if (!isNaN(vLat) && !isNaN(vLng)) {
            const vRadius = vendor.radiusKm || vendor.deliveryRadius || vendor.assignedRadius || 5;
            const R = 6371;
            const dLat = (vLat - custLat) * (Math.PI / 180);
            const dLon = (vLng - custLng) * (Math.PI / 180);
            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(custLat * (Math.PI / 180)) * Math.cos(vLat * (Math.PI / 180)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            if (distKm > vRadius) return false;
          }
        }

        return true;
      });

      if (servingVendors.length > 0) {
        servingVendorIds = servingVendors.map(v => v._id);
        nearestVendor = servingVendors[0];
      }
    }

    // Fallback handling when servingVendorIds is empty
    if (servingVendorIds.length === 0) {
      // If location parameters (coordinates or pincode) were explicitly provided, do NOT fall back to all vendors
      if ((latitude && longitude) || pincode) {
        return res.json({
          success: true,
          serviceAvailable: false,
          message: "No active vendors available at your location.",
          products: [],
          groupedProducts: { featured: [], recentlyAdded: [], byCategory: [] }
        });
      }

      // Location-less search fallback: include all approved active vendors
      const activeVendors = await Vendor.find({ status: "approved", accountStatus: "active" });
      if (activeVendors.length > 0) {
        servingVendorIds = activeVendors.map(v => v._id);
        nearestVendor = activeVendors[0];
      } else {
        return res.json({
          success: true,
          serviceAvailable: false,
          message: "No active vendors available.",
          products: [],
          groupedProducts: { featured: [], recentlyAdded: [], byCategory: [] }
        });
      }
    }

    // 4. Find listed admin products by all serving vendors
    const matchingListings = await VendorListing.find({
      vendorId: { $in: servingVendorIds },
      isAvailable: true
    }).select("variantId");

    const listedVariantIds = matchingListings.map((l) => l.variantId);
    const listedVariants = await ProductVariant.find({ _id: { $in: listedVariantIds } }).select("productId");
    const listedProductIdsFromListing = listedVariants.map((v) => v.productId);

    // Get linked master products from VendorProduct references
    const matchingVendorProducts = await VendorProduct.find({
      vendorId: { $in: servingVendorIds },
      status: "active"
    }).populate("vendorId", "shopName address phone");

    const linkedProductIds = matchingVendorProducts.map((vp) => vp.masterProductId.toString());

    // Group vendor product links by masterProductId into a Map of arrays to prevent overwriting
    const vendorProductsMultiMap = new Map();
    matchingVendorProducts.forEach((vp) => {
      const key = vp.masterProductId.toString();
      if (!vendorProductsMultiMap.has(key)) {
        vendorProductsMultiMap.set(key, []);
      }
      vendorProductsMultiMap.get(key).push(vp);
    });

    // Combine both sets of product IDs
    const combinedProductIds = [...listedProductIdsFromListing, ...linkedProductIds];

    // 5. Construct Product Query
    const productQuery = {
      status: { $in: ["active", "approved"] },
      isDeleted: { $ne: true },
      $or: [
        { creatorModel: "Vendor", createdBy: { $in: servingVendorIds } },
        { _id: { $in: combinedProductIds } }
      ]
    };

    // 6. Apply Search & Category Filters
    if (search) {
      const searchVariants = await ProductVariant.find({
        $or: [
          { sku: { $regex: search, $options: "i" } },
          { barcode: { $regex: search, $options: "i" } }
        ]
      }).select("productId");
      const searchVarProductIds = searchVariants.map((v) => v.productId);

      // Also search ProductFamily.searchKeywords to match keyword-tagged families
      const matchingFamilies = await ProductFamily.find({
        searchKeywords: { $elemMatch: { $regex: search, $options: "i" } }
      }).select("_id");
      const familyMatchedProductIds = matchingFamilies.length > 0
        ? (await Product.find({ familyId: { $in: matchingFamilies.map(f => f._id) } }).select("_id")).map(p => p._id)
        : [];

      productQuery.$and = productQuery.$and || [];
      productQuery.$and.push({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { brand: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
          { _id: { $in: searchVarProductIds } },
          { _id: { $in: familyMatchedProductIds } },
        ]
      });
    }

    if (category && category !== "all") {
      const categoryDoc = mongoose.isValidObjectId(category)
        ? { _id: category }
        : await Category.findOne({ slug: category });
      if (categoryDoc) {
        productQuery.categoryId = categoryDoc._id;
      } else {
        return res.json({ success: true, products: [], groupedProducts: { featured: [], recentlyAdded: [], byCategory: [] } });
      }
    }

    if (subCategory && subCategory !== "all") {
      const subCategoryDoc = mongoose.isValidObjectId(subCategory)
        ? { _id: subCategory }
        : await SubCategory.findOne({ slug: subCategory });
      if (subCategoryDoc) {
        productQuery.subCategoryId = subCategoryDoc._id;
      } else {
        return res.json({ success: true, products: [], groupedProducts: { featured: [], recentlyAdded: [], byCategory: [] } });
      }
    }

    if (productFamily && productFamily !== "all") {
      const familyDoc = mongoose.isValidObjectId(productFamily)
        ? { _id: productFamily }
        : await ProductFamily.findOne({ slug: productFamily });
      if (familyDoc) {
        productQuery.familyId = familyDoc._id;
      } else {
        return res.json({ success: true, products: [], groupedProducts: { featured: [], recentlyAdded: [], byCategory: [] } });
      }
    }

    if (brand && brand !== "all") {
      productQuery.brand = { $regex: new RegExp("^" + brand.trim() + "$", "i") };
    }

    // 7. Fetch products and populate variants + listings
    const products = await Product.find(productQuery)
      .populate("categoryId", "name slug")
      .populate("subCategoryId", "name slug")
      .populate("familyId", "name slug")
      .populate({
        path: "variants",
        populate: {
          path: "vendorListings",
          match: { vendorId: nearestVendor._id, isAvailable: true }
        }
      });

    // 8. Map prices & inventory
    const mappedProducts = [];
    for (const product of products) {
      const variantsList = [];
      const vpLinks = vendorProductsMultiMap.get(product._id.toString()) || [];
      
      // Combine active sellers from both VendorProduct reference links AND master Product listings
      const allSellersMap = new Map();

      // 1. Add sellers from VendorProduct reference links
      for (const vp of vpLinks) {
        const vId = vp.vendorId?._id?.toString() || vp.vendorId?.toString();
        if (vId) {
          allSellersMap.set(vId, {
            vendorId: vId,
            vendorName: vp.vendorId?.shopName || "Partner Store",
            price: vp.price,
            mrp: vp.mrp || vp.price,
            discount: (vp.mrp && vp.mrp > vp.price) ? Math.round(((vp.mrp - vp.price) / vp.mrp) * 100) : 0,
            stock: vp.stock,
            sku: vp.sku
          });
        }
      }

      // 2. Add seller from master Product creator if serving vendor & stock > 0
      if (product.createdBy) {
        const creatorVendorIdStr = product.createdBy.toString();
        const isServingCreator = servingVendorIds.some(id => id.toString() === creatorVendorIdStr);
        
        if (isServingCreator && !allSellersMap.has(creatorVendorIdStr)) {
          const creatorVendor = await Vendor.findById(product.createdBy).select("shopName");
          if (creatorVendor) {
            const firstVariant = product.variants?.[0];
            const masterPrice = firstVariant?.basePrice || primaryVpLink?.price || 100;
            const masterMrp = firstVariant?.mrp || masterPrice;
            const masterStock = 15; // Active creator stock

            allSellersMap.set(creatorVendorIdStr, {
              vendorId: creatorVendorIdStr,
              vendorName: creatorVendor.shopName || "Partner Store",
              price: masterPrice,
              mrp: masterMrp,
              discount: (masterMrp && masterMrp > masterPrice) ? Math.round(((masterMrp - masterPrice) / masterMrp) * 100) : 0,
              stock: masterStock,
              sku: firstVariant?.sku || product.slug
            });
          }
        }
      }

      // Sort all sellers by price ascending (cheapest vendor first)
      const otherSellers = Array.from(allSellersMap.values()).sort((a, b) => a.price - b.price);

      let primaryVpLink = null;
      let primaryVendor = nearestVendor;

      if (vpLinks.length > 0) {
        // Sort active vendor links by price ascending (cheapest vendor first)
        vpLinks.sort((a, b) => a.price - b.price);
        primaryVpLink = vpLinks[0];
        if (primaryVpLink.vendorId?._id) {
          primaryVendor = primaryVpLink.vendorId;
        }

        // Linked master product details mapping using primary (cheapest) seller
        const linkPrice = primaryVpLink.price;
        const linkStock = primaryVpLink.stock;

        // Map variants of the master product
        if (product.variants && product.variants.length > 0) {
          for (const variant of product.variants) {
            const listings = variant.vendorListings || [];
            const matchingListing = listings.find((l) => l.vendorId.toString() === primaryVendor._id.toString());

            let sellingPrice = matchingListing ? matchingListing.sellingPrice : linkPrice;
            let mrp = matchingListing ? (matchingListing.mrp || primaryVpLink.mrp || variant.mrp) : (primaryVpLink.mrp || variant.mrp || linkPrice);
            let stockQty = matchingListing ? (matchingListing.stock?.quantity ?? 0) : linkStock;

            variantsList.push({
              _id: variant._id,
              variantLabel: variant.variantLabel,
              packSize: variant.packSize,
              sku: primaryVpLink.sku || variant.sku,
              barcode: variant.barcode,
              images: variant.images && variant.images.length > 0 ? variant.images : product.images,
              mrp,
              sellingPrice,
              discount: mrp > sellingPrice ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0,
              stockQty,
              stockStatus: stockQty > 0 ? "in_stock" : "out_of_stock",
              vendorId: primaryVendor._id,
              vendorName: primaryVendor.shopName
            });
          }
        } else {
          // Virtual default variant fallback if master product has no variants
          variantsList.push({
            _id: product._id,
            variantLabel: "Standard",
            packSize: { value: 1, unit: product.unitType === "weight" ? "kg" : "pcs" },
            sku: primaryVpLink.sku,
            images: product.images,
            mrp: linkPrice,
            sellingPrice: linkPrice,
            discount: 0,
            stockQty: linkStock,
            stockStatus: linkStock > 0 ? "in_stock" : "out_of_stock",
            vendorId: primaryVendor._id,
            vendorName: primaryVendor.shopName
          });
        }
      } else {
        // Standard flow for custom vendor-created products or products listed via VendorListing
        for (const variant of (product.variants || [])) {
          const listings = variant.vendorListings || [];
          
          let sellingPrice = variant.basePrice;
          let mrp = variant.mrp;
          let stockQty = 0;

          if (product.creatorModel === "Vendor" && product.createdBy?.toString() === nearestVendor._id.toString()) {
            const matchingListing = listings.find((l) => l.vendorId.toString() === nearestVendor._id.toString());
            if (matchingListing) {
              sellingPrice = matchingListing.sellingPrice;
              stockQty = matchingListing.stock?.quantity ?? 0;
            } else {
              sellingPrice = variant.basePrice;
              stockQty = 15; // Fallback stock qty
            }
          } else {
            const matchingListing = listings.find((l) => l.vendorId.toString() === nearestVendor._id.toString());
            if (!matchingListing) continue; // skip if this vendor doesn't list it
            sellingPrice = matchingListing.sellingPrice;
            stockQty = matchingListing.stock?.quantity ?? 0;
          }

          variantsList.push({
            _id: variant._id,
            variantLabel: variant.variantLabel,
            packSize: variant.packSize,
            sku: variant.sku,
            barcode: variant.barcode,
            images: variant.images && variant.images.length > 0 ? variant.images : product.images,
            mrp,
            sellingPrice,
            discount: mrp > sellingPrice ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0,
            stockQty,
            stockStatus: stockQty > 0 ? "in_stock" : "out_of_stock",
            vendorId: nearestVendor._id,
            vendorName: nearestVendor.shopName
          });
        }
      }

      if (variantsList.length === 0) continue;

      let filteredVariants = variantsList;
      if (availability === "in_stock") {
        filteredVariants = filteredVariants.filter((v) => v.stockQty > 0);
      }
      if (minPrice) {
        filteredVariants = filteredVariants.filter((v) => v.sellingPrice >= Number(minPrice));
      }
      if (maxPrice) {
        filteredVariants = filteredVariants.filter((v) => v.sellingPrice <= Number(maxPrice));
      }

      if (filteredVariants.length === 0) continue;

      const primaryVariant = filteredVariants[0];

      mappedProducts.push({
        _id: product._id,
        slug: product.slug,
        name: product.name,
        brand: product.brand,
        description: product.description,
        images: product.images,
        unitType: product.unitType,
        status: product.status,
        categoryId: product.categoryId,
        subCategoryId: product.subCategoryId,
        familyId: product.familyId,
        isReturnable: product.isReturnable,
        variants: filteredVariants,
        otherSellers: otherSellers,
        createdAt: product.createdAt,
        primaryPrice: primaryVariant.sellingPrice,
        primaryMrp: primaryVariant.mrp,
        primaryDiscount: primaryVariant.discount,
        primaryUnit: primaryVariant.variantLabel,
        primaryStockStatus: primaryVariant.stockStatus,
        primaryVendorName: primaryVariant.vendorName,
        primaryVendorId: primaryVariant.vendorId,
        averageRating: primaryVpLink ? (primaryVpLink.averageRating || 0) : (product.averageRating || 0),
        totalReviews: primaryVpLink ? (primaryVpLink.totalReviews || 0) : (product.totalReviews || 0)
      });
    }

    // 9. Group dynamic products lists for default homepage rendering
    const isFilterActive = !!(search || category || subCategory || productFamily || brand || minPrice || maxPrice || availability);
    let groupedProducts = {
      featured: [],
      recentlyAdded: [],
      byCategory: []
    };

    if (!isFilterActive) {
      groupedProducts.recentlyAdded = [...mappedProducts]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 8);

      groupedProducts.featured = [...mappedProducts]
        .sort((a, b) => b.primaryDiscount - a.primaryDiscount)
        .slice(0, 8);

      const categoryMap = {};
      for (const p of mappedProducts) {
        const catId = p.categoryId?._id?.toString() || "other";
        const catName = p.categoryId?.name || "Other";
        if (!categoryMap[catId]) {
          categoryMap[catId] = {
            category: { _id: catId, name: catName },
            products: []
          };
        }
        categoryMap[catId].products.push(p);
      }
      groupedProducts.byCategory = Object.values(categoryMap);
    }

    res.status(200).json({
      success: true,
      serviceAvailable: true,
      products: mappedProducts,
      groupedProducts,
      nearestVendor: {
        _id: nearestVendor._id,
        shopName: nearestVendor.shopName,
        distance: minDistance !== Infinity ? Number(minDistance.toFixed(2)) : null
      }
    });

  } catch (error) {
    console.error("Get Customer Products Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get nearby vendors and their products based on user geolocation
// @route   GET /api/vendors/nearby
// @access  Public
export const getNearbyVendors = async (req, res) => {
  try {
    const { lat, lng, availability } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: "Latitude (lat) and Longitude (lng) are required." });
    }

    const latVal = parseFloat(lat);
    const lngVal = parseFloat(lng);

    if (isNaN(latVal) || latVal < -90 || latVal > 90 || isNaN(lngVal) || lngVal < -180 || lngVal > 180) {
      return res.status(400).json({ success: false, message: "Invalid latitude or longitude coordinates." });
    }

    // DB-level geospatial aggregation to find all active vendors covering the customer's coordinate within their radius
    const nearbyVendors = await Vendor.aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [lngVal, latVal] },
          distanceField: "distance", // in meters
          spherical: true,
          query: { status: "approved", accountStatus: "active" }
        }
      },
      {
        $project: {
          shopName: 1,
          shopType: 1,
          phone: 1,
          businessEmail: 1,
          ownerDetails: 1,
          storeDetails: 1,
          address: 1,
          latitude: 1,
          longitude: 1,
          deliveryRadius: 1,
          radiusKm: 1,
          assignedRadius: 1,
          status: 1,
          accountStatus: 1,
          distanceKm: { $divide: ["$distance", 1000] }
        }
      },
      {
        $match: {
          $expr: {
            $lte: ["$distanceKm", { $ifNull: ["$radiusKm", { $ifNull: ["$deliveryRadius", { $ifNull: ["$assignedRadius", 5] }] }] }]
          }
        }
      },
      {
        $sort: { distanceKm: 1 }
      }
    ]);

    // For each vendor, fetch active products and listings
    const vendorsWithProducts = [];
    for (const vendor of nearbyVendors) {
      const listings = await VendorListing.find({
        vendorId: vendor._id,
        isAvailable: true
      }).select("variantId");

      const listedVariantIds = listings.map((l) => l.variantId);
      const listedVariants = await ProductVariant.find({ _id: { $in: listedVariantIds } }).select("productId");
      const listedProductIds = listedVariants.map((v) => v.productId);

      const products = await Product.find({
        status: "active",
        isDeleted: { $ne: true },
        $or: [
          { creatorModel: "Vendor", createdBy: vendor._id },
          { _id: { $in: listedProductIds } }
        ]
      })
        .populate("categoryId", "name slug")
        .populate("subCategoryId", "name slug")
        .populate({
          path: "variants",
          populate: {
            path: "vendorListings",
            match: { vendorId: vendor._id, isAvailable: true }
          }
        });

      const mappedProducts = [];
      for (const product of products) {
        const variantsList = [];
        for (const variant of product.variants || []) {
          const listings = variant.vendorListings || [];
          let sellingPrice = variant.basePrice;
          let stockQty = 0;

          const matchingListing = listings.find((l) => l.vendorId.toString() === vendor._id.toString());
          if (product.creatorModel === "Vendor" && product.createdBy?.toString() === vendor._id.toString()) {
            if (matchingListing) {
              sellingPrice = matchingListing.sellingPrice;
              stockQty = matchingListing.stock?.quantity ?? 0;
            } else {
              sellingPrice = variant.basePrice;
              stockQty = 15;
            }
          } else {
            if (!matchingListing) continue;
            sellingPrice = matchingListing.sellingPrice;
            stockQty = matchingListing.stock?.quantity ?? 0;
          }

          variantsList.push({
            _id: variant._id,
            variantLabel: variant.variantLabel,
            packSize: variant.packSize,
            sku: variant.sku,
            mrp: variant.mrp,
            sellingPrice,
            discount: variant.mrp > sellingPrice ? Math.round(((variant.mrp - sellingPrice) / variant.mrp) * 100) : 0,
            stockQty,
            stockStatus: stockQty > 0 ? "in_stock" : "out_of_stock",
            vendorId: vendor._id,
            vendorName: vendor.shopName
          });
        }

        let filteredVariants = variantsList;
        if (availability === "in_stock") {
          filteredVariants = filteredVariants.filter((v) => v.stockQty > 0);
        }
        if (filteredVariants.length === 0) continue;

        mappedProducts.push({
          _id: product._id,
          name: product.name,
          brand: product.brand,
          description: product.description,
          images: product.images,
          variants: filteredVariants
        });
      }

      vendorsWithProducts.push({
        vendor,
        products: mappedProducts
      });
    }

    res.status(200).json({
      success: true,
      vendors: vendorsWithProducts
    });
  } catch (error) {
    console.error("Get Nearby Vendors Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get reviews for a product (scoped to vendor)
// @route   GET /api/catalog/products/:id/reviews
// @access  Public
export const getProductReviews = async (req, res) => {
  try {
    const { id } = req.params;
    const { vendorId } = req.query;

    if (!vendorId) {
      return res.status(400).json({ success: false, message: "Vendor ID is required." });
    }

    const reviews = await ProductReview.find({ productId: id, vendorId })
      .populate("customerId", "fullName")
      .sort({ createdAt: -1 });

    const processedReviews = reviews.map((r) => {
      const reviewObj = r.toObject();
      if (r.customerId && r.customerId.fullName) {
        reviewObj.customerName = r.customerId.fullName;
      }
      return reviewObj;
    });

    const totalReviews = processedReviews.length;
    const averageRating = totalReviews > 0
      ? parseFloat((processedReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(2))
      : 0;

    res.status(200).json({
      success: true,
      reviews: processedReviews,
      averageRating,
      totalReviews
    });
  } catch (error) {
    console.error("Get Product Reviews Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add review for a product (scoped to vendor, verified purchase check)
// @route   POST /api/catalog/products/:id/reviews
// @access  Private (Customer)
export const addProductReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, reviewText, vendorId } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be between 1 and 5." });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }

    // Resolve target vendor
    let targetVendorId = vendorId;
    if (!targetVendorId && product.creatorModel === "Vendor") {
      targetVendorId = product.createdBy;
    }

    if (!targetVendorId) {
      return res.status(400).json({ success: false, message: "Vendor ID is required to rate this product." });
    }

    // Verified purchase check: must have a Delivered order containing the product from this vendor
    const verifiedOrder = await CustomerOrder.findOne({
      customerId: req.user._id,
      vendorId: targetVendorId,
      orderStatus: "Delivered",
      "items.productId": id
    });

    if (!verifiedOrder) {
      return res.status(403).json({
        success: false,
        message: "You can only rate products you have purchased and received from this vendor."
      });
    }

    // Upsert review (enforcing single review per customer per vendor product)
    let review = await ProductReview.findOne({
      productId: id,
      vendorId: targetVendorId,
      customerId: req.user._id
    });

    if (review) {
      review.rating = rating;
      review.reviewText = reviewText || "";
      await review.save();
    } else {
      review = await ProductReview.create({
        productId: id,
        vendorId: targetVendorId,
        customerId: req.user._id,
        orderId: verifiedOrder._id,
        customerName: req.user.fullName || req.user.name || "Customer",
        rating,
        reviewText: reviewText || "",
        isVerifiedPurchase: true
      });
    }

    // Recalculate average rating & total reviews for this vendor product
    const allReviews = await ProductReview.find({ productId: id, vendorId: targetVendorId });
    const totalReviews = allReviews.length;
    const averageRating = totalReviews > 0
      ? parseFloat((allReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(2))
      : 0;

    // Update denormalized aggregates on VendorProduct or Product
    if (product.creatorModel === "Vendor" && product.createdBy.toString() === targetVendorId.toString()) {
      product.averageRating = averageRating;
      product.totalReviews = totalReviews;
      await product.save();
    } else {
      await VendorProduct.updateOne(
        { masterProductId: id, vendorId: targetVendorId },
        { averageRating, totalReviews }
      );
    }

    res.status(200).json({
      success: true,
      message: "Thank you for reviewing this product!",
      review,
      averageRating,
      totalReviews
    });
  } catch (error) {
    console.error("Add Product Review Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Check review eligibility & existing review details
// @route   GET /api/catalog/products/:id/review-eligibility
// @access  Private (Customer)
export const checkReviewEligibility = async (req, res) => {
  try {
    const { id } = req.params;
    const { vendorId } = req.query;

    if (!vendorId) {
      return res.status(400).json({ success: false, message: "Vendor ID is required." });
    }

    const verifiedOrder = await CustomerOrder.findOne({
      customerId: req.user._id,
      vendorId: vendorId,
      orderStatus: "Delivered",
      "items.productId": id
    });

    const existingReview = await ProductReview.findOne({
      productId: id,
      vendorId,
      customerId: req.user._id
    });

    res.status(200).json({
      success: true,
      eligible: !!verifiedOrder,
      hasReviewed: !!existingReview,
      existingReview: existingReview || null
    });
  } catch (error) {
    console.error("Check Review Eligibility Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Seed Faridabad Vendor and link all 62 products & 107 variants
// @route   GET /api/seed-faridabad-vendor
// @access  Public (One-time utility)
export const seedFaridabadVendor = async (req, res) => {
  try {
    const vendorEmail = "faridabad_vendor@aryusha.in";
    let vendor = await Vendor.findOne({ businessEmail: vendorEmail });

    const faridabadPincodes = [
      "121001", "121002", "121003", "121004", "121005", "121006",
      "121007", "121008", "121009", "121010", "121012"
    ];

    const vendorData = {
      shopName: "Aryusha Central Store Faridabad",
      shopType: "Grocery & Supermarket",
      businessEmail: vendorEmail,
      phone: "9876543210",
      password: "$2a$10$placeholderpasswordhashformigratedvendor",
      status: "approved",
      accountStatus: "active",
      address: {
        village: "Faridabad",
        district: "Faridabad",
        state: "Haryana",
        pincode: "121001",
        country: "India",
        city: "Faridabad",
        addressLine: "Sector 15 Main Market, Faridabad"
      },
      storeDetails: {
        storeName: "Aryusha Central Store Faridabad",
        city: "Faridabad",
        state: "Haryana",
        pincode: "121001",
        serviceAreas: faridabadPincodes,
        storeStatus: "open"
      },
      assignedArea: "121001",
      assignedRadius: 50,
      deliveryRadius: 50,
      radiusKm: 50,
      latitude: 28.4089,
      longitude: 77.3178,
      location: {
        type: "Point",
        coordinates: [77.3178, 28.4089]
      },
      serviceAreas: faridabadPincodes.map((pin) => ({
        pincode: pin,
        areaName: `Faridabad Area (${pin})`,
        city: "Faridabad",
        state: "Haryana"
      }))
    };

    if (!vendor) {
      vendor = await Vendor.create(vendorData);
    } else {
      Object.assign(vendor, vendorData);
      await vendor.save();
    }

    // Link Products
    const allProducts = await Product.find({ isDeleted: { $ne: true } });
    const existingVP = await VendorProduct.find({ vendorId: vendor._id }).select("masterProductId").lean();
    const existingVPSet = new Set(existingVP.map(vp => String(vp.masterProductId)));

    const vpDocsToInsert = [];
    for (const prod of allProducts) {
      if (!existingVPSet.has(String(prod._id))) {
        vpDocsToInsert.push({
          vendorId: vendor._id,
          masterProductId: prod._id,
          price: 99,
          mrp: 120,
          stock: 100,
          sku: prod.slug || `SKU-${prod._id}`,
          status: "active"
        });
      }
    }
    if (vpDocsToInsert.length > 0) {
      await VendorProduct.collection.insertMany(vpDocsToInsert);
    }

    // Link Variants
    const allVariants = await ProductVariant.find();
    const existingVL = await VendorListing.find({ vendorId: vendor._id }).select("variantId").lean();
    const existingVLSet = new Set(existingVL.map(vl => String(vl.variantId)));

    const vlDocsToInsert = [];
    for (const variant of allVariants) {
      if (!existingVLSet.has(String(variant._id))) {
        vlDocsToInsert.push({
          vendorId: vendor._id,
          variantId: variant._id,
          sellingPrice: variant.basePrice || variant.mrp || 10,
          mrp: variant.mrp || 10,
          stock: { quantity: 100, lowStockThreshold: 5 },
          isAvailable: true
        });
      }
    }
    if (vlDocsToInsert.length > 0) {
      await VendorListing.collection.insertMany(vlDocsToInsert);
    }

    return res.json({
      success: true,
      message: "Faridabad Vendor & Product Linkage Created Successfully!",
      vendorId: vendor._id,
      vendorProductsLinked: vpDocsToInsert.length + existingVPSet.size,
      vendorListingsLinked: vlDocsToInsert.length + existingVLSet.size
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


