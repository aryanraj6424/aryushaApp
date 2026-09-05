import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    shortDescription: {
      type: String,
      trim: true,
    },
    fullDescription: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    subCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
    },
    familyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductFamily",
    },
    brand: {
      type: String,
      trim: true,
    },
    unitType: {
      type: String,
      enum: ["Weight", "Volume", "Piece", "Length", "Area"],
      trim: true,
    },
    sku: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    mrp: {
      type: Number,
      required: [true, "MRP is required"],
      min: 0,
    },
    sellingPrice: {
      type: Number,
      required: [true, "Selling price is required"],
      min: 0,
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    images: [
      {
        type: String,
        trim: true,
      },
    ],
    attributes: [
      {
        id: String,
        name: String,
        value: String,
      },
    ],
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    slug: { type: String, lowercase: true, trim: true, index: true },
    coupon_allowed: { type: Boolean, default: false },
    max_discount_amount: { type: Number, default: null, min: 0 },
    metaTitle: { type: String, default: "" },
    metaDescription: { type: String, default: "" },
    canonicalUrl: { type: String, default: "" },
    ogImage: { type: String, default: "" },
  },
  {
    timestamps: true,
  }
);

productSchema.index({ slug: 1 }, { unique: true, sparse: true });

const Product = mongoose.models.Product || mongoose.model("Product", productSchema);

export default Product;
