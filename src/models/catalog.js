/**
 * ============================================================================
 * GaonKart — full catalog database layer (MongoDB / Mongoose)
 * ============================================================================
 * Hierarchy:  Category -> SubCategory -> ProductFamily -> Product -> ProductVariant
 * VendorListing bridges a ProductVariant to a specific vendor's own price/stock,
 * since the same variant can be sold by multiple local wholesalers at
 * different prices and stock levels.
 *
 * Usage:
 *   import { Category } from './models/catalog.js';
 *   const category = await Category.create({ name: 'Fruits and Vegetables' });
 * ============================================================================
 */
import mongoose from "mongoose";

const { Schema } = mongoose;

/* ============================================================================
 * 1. CATEGORY — top level of the catalog hierarchy
 * ========================================================================= */
const categorySchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      unique: true,
      maxlength: 120
    },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, trim: true, maxlength: 500 },
    image: { type: String, trim: true },
    icon: { type: String, trim: true, default: "" },
    sortOrder: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', default: null, index: true },
    isFeatured: { type: Boolean, default: false, index: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    // SEO fields
    metaTitle: { type: String, default: "" },
    metaDescription: { type: String, default: "" },
    canonicalUrl: { type: String, default: "" },
    ogImage: { type: String, default: "" },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' }
  },
  { timestamps: true }
);

categorySchema.pre('validate', function () {
  if (this.name && (!this.slug || this.isModified('name'))) {
    this.slug = this.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
});
categorySchema.index({ status: 1, sortOrder: 1 });

categorySchema.virtual('subCategories', {
  ref: 'SubCategory',
  localField: '_id',
  foreignField: 'categoryId',
  match: { isDeleted: { $ne: true } }
});

categorySchema.virtual('productFamilies', {
  ref: 'ProductFamily',
  localField: '_id',
  foreignField: 'categoryId',
  match: { isDeleted: { $ne: true } }
});

categorySchema.virtual('products', {
  ref: 'Product',
  localField: '_id',
  foreignField: 'categoryId',
  match: { isDeleted: { $ne: true } }
});

categorySchema.set('toJSON', { virtuals: true });
categorySchema.set('toObject', { virtuals: true });


/* ============================================================================
 * 2. SUBCATEGORY — belongs to a Category
 * ========================================================================= */
const subCategorySchema = new Schema(
  {
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: [true, 'Parent category is required'], index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 500 },
    image: { type: String, trim: true },
    sortOrder: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', default: null, index: true },
    // SEO fields
    metaTitle: { type: String, default: "" },
    metaDescription: { type: String, default: "" },
    canonicalUrl: { type: String, default: "" },
    ogImage: { type: String, default: "" },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' }
  },
  { timestamps: true }
);

subCategorySchema.pre('validate', function () {
  if (this.name && (!this.slug || this.isModified('name'))) {
    this.slug = this.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
});
// a sub-category name must be unique within its parent category, not globally
subCategorySchema.index({ categoryId: 1, name: 1 }, { unique: true });
subCategorySchema.index({ categoryId: 1, status: 1, sortOrder: 1 });

subCategorySchema.virtual('productFamilies', {
  ref: 'ProductFamily',
  localField: '_id',
  foreignField: 'subCategoryId',
  match: { isDeleted: { $ne: true } }
});

subCategorySchema.virtual('products', {
  ref: 'Product',
  localField: '_id',
  foreignField: 'subCategoryId',
  match: { isDeleted: { $ne: true } }
});

subCategorySchema.set('toJSON', { virtuals: true });
subCategorySchema.set('toObject', { virtuals: true });

/* ============================================================================
 * 3. PRODUCT FAMILY — belongs to a SubCategory
 * ========================================================================= */
const productFamilySchema = new Schema(
  {
    subCategoryId: { type: Schema.Types.ObjectId, ref: 'SubCategory', required: [true, 'Parent sub-category is required'], index: true },
    // denormalized for fast breadcrumb lookups without extra joins
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    brandId: { type: Schema.Types.ObjectId, ref: 'Brand', default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 500 },
    shortDescription: { type: String, trim: true, default: "" },
    image: { type: String, trim: true },
    images: [{
      url: { type: String, required: true },
      altText: { type: String, required: true }
    }],
    tags: [{ type: String }],
    unitType: { type: String, default: "" },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', default: null, index: true },
    shelfLife: { type: String, default: "" },
    storageInstructions: { type: String, default: "" },
    countryOfOrigin: { type: String, default: "" },
    fssaiLicenseNumber: { type: String, default: "" },
    sortOrder: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive', 'draft'], default: 'draft', index: true },
    approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved', index: true },
    // SEO fields
    metaTitle: { type: String, default: "" },
    metaDescription: { type: String, default: "" },
    canonicalUrl: { type: String, default: "" },
    ogImage: { type: String, default: "" },
    searchKeywords: [{ type: String }],
    structuredDataType: { type: String, default: "" },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId },
    creatorModel: { type: String, enum: ['Admin', 'Vendor'], default: 'Admin' },
    updatedBy: { type: Schema.Types.ObjectId },
    approvalHistory: [
      {
        status: String,
        updatedBy: { type: Schema.Types.ObjectId },
        remarks: String,
        updatedAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

productFamilySchema.pre('validate', function () {
  if (this.name && (!this.slug || this.isModified('name'))) {
    this.slug = this.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
});
productFamilySchema.index({ subCategoryId: 1, name: 1 }, { unique: true });
productFamilySchema.index({ subCategoryId: 1, unitId: 1 });
productFamilySchema.index({ categoryId: 1, unitId: 1 });

productFamilySchema.virtual('products', {
  ref: 'Product',
  localField: '_id',
  foreignField: 'familyId',
  match: { isDeleted: { $ne: true } }
});

productFamilySchema.set('toJSON', { virtuals: true });
productFamilySchema.set('toObject', { virtuals: true });

/* ============================================================================
 * 4. PRODUCT — the master/parent product, one level above sellable variants
 *    e.g. "Tata Sampann Atta" is a Product; "1 kg" / "5 kg" are its Variants.
 * ========================================================================= */
const productSchema = new Schema(
  {
    familyId: { type: Schema.Types.ObjectId, ref: 'ProductFamily', required: [true, 'Product family is required'], index: true },
    // denormalized ancestry, avoids a 3-way join every time the customer app
    // needs to render a breadcrumb or filter by category/sub-category
    subCategoryId: { type: Schema.Types.ObjectId, ref: 'SubCategory', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },

    name: { type: String, required: true, trim: true, maxlength: 200, index: 'text' },
    slug: { type: String, required: true, lowercase: true, trim: true },
    brand: { type: String, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 10000 },
    images: {
      type: [String], // array of image URLs, first image treated as primary
      validate: { validator: (arr) => arr.length <= 8, message: 'A product can have at most 8 images' },
      default: []
    },

    // the unit family this product is sold in — every variant's packSize.unit
    // should belong to the same family (weight, volume, or count)
    unitType: { type: String, enum: ['weight', 'volume', 'count'], required: true },

    isReturnable: { type: Boolean, default: false },
    shelfLifeDays: { type: Number }, // useful for perishables like dairy/produce

    status: { type: String, enum: ['active', 'inactive', 'draft', 'pending', 'approved', 'rejected', 'hidden'], default: 'draft', index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    commissionType: { type: String, enum: ['percentage', 'flat', 'inherit'], default: 'inherit' },
    commissionValue: { type: Number, default: null },
    createdBy: { type: Schema.Types.ObjectId },
    creatorModel: { type: String, enum: ['Admin', 'Vendor'], default: 'Admin' },
    approvalHistory: [
      {
        status: String,
        updatedBy: { type: Schema.Types.ObjectId },
        remarks: String,
        updatedAt: { type: Date, default: Date.now }
      }
    ],
    averageRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    coupon_allowed: { type: Boolean, default: false },
    max_discount_amount: { type: Number, default: null, min: 0 },
    // SEO fields
    metaTitle: { type: String, default: "" },
    metaDescription: { type: String, default: "" },
    canonicalUrl: { type: String, default: "" },
    ogImage: { type: String, default: "" }
  },
  { timestamps: true }
);

productSchema.pre('validate', async function () {
  if (this.name && (!this.slug || this.isModified('name'))) {
    const baseSlug = this.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'product';
    let candidate = baseSlug;
    let counter = 1;
    while (true) {
      const query = { slug: candidate };
      if (this._id) query._id = { $ne: this._id };
      const existing = await this.constructor.findOne(query).select('_id').lean();
      if (!existing) break;
      candidate = `${baseSlug}-${counter}`;
      counter++;
    }
    this.slug = candidate;
  }
});
productSchema.index({ slug: 1 }, { unique: true, sparse: true });
productSchema.index({ familyId: 1, name: 1 });
productSchema.index({ categoryId: 1, subCategoryId: 1, status: 1 });

// virtual: pull in all sellable variants of this product without storing
// them inline (keeps the product document small and variants independently
// queryable/updatable)
productSchema.virtual('variants', { ref: 'ProductVariant', localField: '_id', foreignField: 'productId' });
productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

/* ============================================================================
 * 5. PRODUCT VARIANT — the actual sellable SKU (one specific pack size)
 * ========================================================================= */
const productVariantSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: [true, 'Parent product is required'], index: true },

    variantLabel: { type: String, required: [true, 'Variant label is required'], trim: true, maxlength: 60 }, // e.g. "1 kg", "Pack of 6"

    packSize: {
      value: { type: Number, required: true, min: 0.001 },
      unit: { type: String, enum: ['g', 'kg', 'ml', 'l', 'pcs'], required: true }
    },

    sku: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    barcode: { type: String, trim: true }, // EAN/UPC if the wholesaler has one

    images: { type: [String], default: [] }, // falls back to product.images on the client if empty

    mrp: { type: Number, required: [true, 'MRP is required'], min: 0 },
    // platform's suggested/default selling price; vendors can override
    // their own selling price inside VendorListing
    basePrice: {
      type: Number,
      required: [true, 'Base selling price is required'],
      min: 0,
      validate: { validator: function (v) { return v <= this.mrp; }, message: 'Selling price cannot exceed MRP' }
    },

    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' }
  },
  { timestamps: true }
);

// margin percent is derived, not stored — always accurate, never stale
productVariantSchema.virtual('marginPercent').get(function () {
  if (!this.mrp) return 0;
  return Number((((this.mrp - this.basePrice) / this.mrp) * 100).toFixed(2));
});
productVariantSchema.virtual('vendorListings', { ref: 'VendorListing', localField: '_id', foreignField: 'variantId' });
productVariantSchema.set('toJSON', { virtuals: true });
productVariantSchema.set('toObject', { virtuals: true });

// same product cannot have two variants with an identical pack size
productVariantSchema.index({ productId: 1, 'packSize.value': 1, 'packSize.unit': 1 }, { unique: true });
productVariantSchema.index({ productId: 1, status: 1 });

/* ============================================================================
 * 6. VENDOR LISTING — bridges a catalog variant to one vendor's own
 *    price/stock. Keeping this separate from ProductVariant is what lets two
 *    wholesalers sell the exact same 1kg pack at two different prices/stock.
 * ========================================================================= */
const vendorListingSchema = new Schema(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true, index: true },

    sellingPrice: { type: Number, required: true, min: 0 },
    mrp: { type: Number, min: 0 },
    stock: {
      quantity: { type: Number, default: 0, min: 0 },
      lowStockThreshold: { type: Number, default: 5 }
    },

    isAvailable: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Vendor' }
  },
  { timestamps: true }
);

vendorListingSchema.virtual('isLowStock').get(function () {
  return this.stock.quantity <= this.stock.lowStockThreshold;
});
vendorListingSchema.set('toJSON', { virtuals: true });
vendorListingSchema.set('toObject', { virtuals: true });
// one vendor cannot list the same variant twice
vendorListingSchema.index({ vendorId: 1, variantId: 1 }, { unique: true });

/* ============================================================================
 * MODEL REGISTRATION
 * ========================================================================= */
/* ============================================================================
 * 2B. BRAND — catalog brands
 * ========================================================================= */
const brandSchema = new Schema(
  {
    name: { type: String, required: [true, 'Brand name is required'], trim: true, unique: true, maxlength: 120 },
    slug: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    description: { type: String, trim: true, maxlength: 500 },
    image: { type: String, trim: true },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active', index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' }
  },
  { timestamps: true }
);

brandSchema.pre('validate', function () {
  if (this.name && (!this.slug || this.isModified('name'))) {
    this.slug = this.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
});

/* ============================================================================
 * 7. VENDOR PRODUCT REFERENCE — links a vendor to a master catalog product
 * ========================================================================= */
const vendorProductSchema = new Schema(
  {
    masterProductId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    price: { 
      type: Number, 
      required: true, 
      min: 0,
      validate: {
        validator: function (v) {
          // If MRP is specified, the selling price cannot exceed MRP
          if (this.mrp !== undefined && this.mrp !== null) {
            return v <= this.mrp;
          }
          return true;
        },
        message: 'Selling price cannot exceed MRP (original price)'
      }
    },
    // mrp represents the original / maximum retail price (optional / nullable)
    // price represents the actual selling price the customer pays
    mrp: { 
      type: Number, 
      min: 0, 
      default: null,
      validate: {
        validator: function (v) {
          // MRP is optional, but if provided, it must be greater than or equal to the selling price (price)
          if (v === undefined || v === null || v === "") {
            return true;
          }
          return v >= this.price;
        },
        message: 'MRP must be greater than or equal to Selling Price (price)'
      }
    },
    stock: { type: Number, default: 0, min: 0 },
    sku: { type: String, required: true, trim: true },
    condition: { type: String, default: "New" },
    vendorNotes: { type: String, default: "" },
    averageRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    coupon_allowed: { type: Boolean, default: false },
    max_discount_amount: { type: Number, default: null, min: 0 },
    commissionType: { type: String, enum: ['percentage', 'flat', 'inherit'], default: 'inherit' },
    commissionValue: { type: Number, default: null },
    status: { type: String, enum: ['active', 'inactive', 'pending', 'rejected'], default: 'pending', index: true }
  },
  { timestamps: true }
);

// A vendor cannot list the same master product twice
vendorProductSchema.index({ vendorId: 1, masterProductId: 1 }, { unique: true });

/* ============================================================================
 * 8. COMMISSION CHANGE HISTORY — tracks admin commission rate updates per vendor product
 * ========================================================================= */
const commissionChangeHistorySchema = new Schema(
  {
    vendorProductId: { type: Schema.Types.ObjectId, ref: 'VendorProduct', required: true, index: true },
    previousType: { type: String, default: 'inherit' },
    previousValue: { type: Number, default: null },
    newType: { type: String, required: true },
    newValue: { type: Number, default: null },
    changedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    changedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

commissionChangeHistorySchema.index({ vendorProductId: 1, changedAt: -1 });

const Brand = mongoose.model('Brand', brandSchema);
const Category = mongoose.model('Category', categorySchema);
const SubCategory = mongoose.model('SubCategory', subCategorySchema);
const ProductFamily = mongoose.model('ProductFamily', productFamilySchema);
const Product = mongoose.model('Product', productSchema);
const ProductVariant = mongoose.model('ProductVariant', productVariantSchema);
const VendorListing = mongoose.model('VendorListing', vendorListingSchema);
const VendorProduct = mongoose.model('VendorProduct', vendorProductSchema);
const CommissionChangeHistory = mongoose.model('CommissionChangeHistory', commissionChangeHistorySchema);

const productReviewSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'CustomerOrder', required: true },
    customerName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    reviewText: { type: String, default: "" },
    isVerifiedPurchase: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// One review per customer per vendor product
productReviewSchema.index({ customerId: 1, vendorId: 1, productId: 1 }, { unique: true });

const ProductReview = mongoose.model('ProductReview', productReviewSchema);

/* ============================================================================
 * EXPORTS
 * ========================================================================= */
export {
  Category,
  SubCategory,
  ProductFamily,
  Product,
  ProductVariant,
  VendorListing,
  VendorProduct,
  CommissionChangeHistory,
  Brand,
  ProductReview
};

