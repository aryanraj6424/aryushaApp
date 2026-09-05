import { Category, Product } from "../models/catalog.js";

// @desc    Get all categories
// @route   GET /api/categories
// @access  Private/Admin
export const getCategories = async (req, res) => {
  try {
    const { status, search } = req.query;
    
    let query = { isDeleted: { $ne: true } };
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    const categories = await Category.find(query)
      .populate({ path: 'subCategories', select: '_id' })
      .populate({ path: 'productFamilies', select: '_id' })
      .populate({ path: 'products', select: '_id' })
      .sort({ sortOrder: 1, name: 1 });
    
    // Get statistics
    const totalCategories = await Category.countDocuments({ isDeleted: { $ne: true } });
    const activeCategories = await Category.countDocuments({ status: 'active', isDeleted: { $ne: true } });
    const inactiveCategories = await Category.countDocuments({ status: 'inactive', isDeleted: { $ne: true } });
    
    res.json({
      categories,
      stats: {
        total: totalCategories,
        active: activeCategories,
        inactive: inactiveCategories
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single category
// @route   GET /api/categories/:id
// @access  Private/Admin
export const getCategoryById = async (req, res) => {
  try {
    const category = await Category.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create new category
// @route   POST /api/categories
// @access  Private/Admin
export const createCategory = async (req, res) => {
  try {
    const {
      name,
      description,
      image,
      icon,
      sortOrder,
      status,
      isFeatured,
      parentId,
      slug,
      metaTitle,
      metaDescription,
      canonicalUrl,
      ogImage
    } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const existing = await Category.findOne({ name: name.trim(), isDeleted: { $ne: true } });
    if (existing) {
      return res.status(400).json({ message: 'Category name already exists' });
    }

    // Slug validation
    const slugVal = slug ? slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const slugExists = await Category.findOne({ slug: slugVal, isDeleted: { $ne: true } });
    if (slugExists) {
      return res.status(400).json({ message: 'URL Slug is already in use by another category' });
    }

    // SEO fallback generation
    let fallbackMetaTitle = metaTitle ? metaTitle.trim() : name.trim();
    if (fallbackMetaTitle.length > 60) fallbackMetaTitle = fallbackMetaTitle.slice(0, 60);

    let fallbackMetaDesc = metaDescription ? metaDescription.trim() : (description ? description.trim() : name.trim());
    if (fallbackMetaDesc.length > 160) fallbackMetaDesc = fallbackMetaDesc.slice(0, 160);

    const category = await Category.create({
      name: name.trim(),
      slug: slugVal,
      description,
      image,
      icon,
      sortOrder: sortOrder || 0,
      status: status || 'active',
      isFeatured: isFeatured === true || isFeatured === "true",
      parentId: parentId || null,
      metaTitle: fallbackMetaTitle,
      metaDescription: fallbackMetaDesc,
      canonicalUrl: canonicalUrl || "",
      ogImage: ogImage || "",
      createdBy: req.admin?._id
    });
    
    res.status(201).json(category);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Category slug/name already exists' });
    }
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Private/Admin
export const updateCategory = async (req, res) => {
  try {
    const {
      name,
      description,
      image,
      icon,
      sortOrder,
      status,
      isFeatured,
      parentId,
      slug,
      metaTitle,
      metaDescription,
      canonicalUrl,
      ogImage
    } = req.body;
    
    const category = await Category.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    if (name && name.trim() !== category.name) {
      const existing = await Category.findOne({ name: name.trim(), isDeleted: { $ne: true } });
      if (existing) {
        return res.status(400).json({ message: 'Category name already exists' });
      }
      category.name = name.trim();
    }

    // Slug validation
    if (slug) {
      const slugVal = slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const slugExists = await Category.findOne({ slug: slugVal, _id: { $ne: req.params.id }, isDeleted: { $ne: true } });
      if (slugExists) {
        return res.status(400).json({ message: 'URL Slug is already in use by another category' });
      }
      category.slug = slugVal;
    }

    // SEO fallback update
    let fallbackMetaTitle = metaTitle ? metaTitle.trim() : (name ? name.trim() : category.name);
    if (fallbackMetaTitle.length > 60) fallbackMetaTitle = fallbackMetaTitle.slice(0, 60);

    let fallbackMetaDesc = metaDescription ? metaDescription.trim() : (description ? description.trim() : (category.description || category.name));
    if (fallbackMetaDesc.length > 160) fallbackMetaDesc = fallbackMetaDesc.slice(0, 160);

    category.description = description !== undefined ? description : category.description;
    category.image = image !== undefined ? image : category.image;
    category.icon = icon !== undefined ? icon : category.icon;
    category.sortOrder = sortOrder !== undefined ? sortOrder : category.sortOrder;
    category.status = status || category.status;
    category.isFeatured = isFeatured !== undefined ? (isFeatured === true || isFeatured === "true") : category.isFeatured;
    category.parentId = parentId !== undefined ? (parentId || null) : category.parentId;
    category.metaTitle = fallbackMetaTitle;
    category.metaDescription = fallbackMetaDesc;
    category.canonicalUrl = canonicalUrl !== undefined ? canonicalUrl : category.canonicalUrl;
    category.ogImage = ogImage !== undefined ? ogImage : category.ogImage;
    category.updatedBy = req.admin?._id;
    
    await category.save();
    
    res.json(category);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Category slug already exists' });
    }
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
export const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const productCount = await Product.countDocuments({ categoryId: req.params.id, isDeleted: { $ne: true } });
    if (productCount > 0) {
      category.status = 'inactive';
      category.isDeleted = true;
      await category.save();
      return res.json({ message: 'Category is in use by products; soft deleted (marked inactive)', success: true, category });
    }
    
    await Category.deleteOne({ _id: req.params.id });
    
    res.json({ message: 'Category deleted successfully', success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update category status
// @route   PATCH /api/categories/:id/status
// @access  Private/Admin
export const updateCategoryStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status || !['active', 'inactive'].includes(status)) {
      return res.status(400).json({ message: 'Valid status (active/inactive) is required' });
    }
    
    const category = await Category.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    category.status = status;
    await category.save();
    
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
