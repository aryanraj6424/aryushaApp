import mongoose from "mongoose";
import Wishlist from "../models/Wishlist.js";
import { Product, ProductVariant, VendorListing, VendorProduct } from "../../models/catalog.js";
import Vendor from "../../vendor/models/Vendor.js";

// Helper: Resolve nearest vendor (copied/adapted from catalogController.js for consistency)
const findNearestVendor = async (latitude, longitude, pincode) => {
  let nearestVendor = null;
  let minDistance = Infinity;

  if (latitude && longitude) {
    const latVal = parseFloat(latitude);
    const lngVal = parseFloat(longitude);

    // Geospatial query
    const activeVendors = await Vendor.find({
      status: "approved",
      accountStatus: "active"
    });

    for (const vendor of activeVendors) {
      if (vendor.latitude && vendor.longitude) {
        const rad = (x) => (x * Math.PI) / 180;
        const R = 6371; // Earth's radius in km
        const dLat = rad(vendor.latitude - latVal);
        const dLng = rad(vendor.longitude - lngVal);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(rad(latVal)) *
            Math.cos(rad(vendor.latitude)) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        const maxRadius = vendor.radiusKm || vendor.deliveryRadius || 5;
        if (distance <= maxRadius && distance < minDistance) {
          minDistance = distance;
          nearestVendor = vendor;
        }
      }
    }
  }

  // Fallback to pincode matching if no geospatial match or coordinates missing
  if (!nearestVendor && pincode) {
    nearestVendor = await Vendor.findOne({
      status: "approved",
      accountStatus: "active",
      "address.pincode": pincode
    });
  }

  // Final fallback: only use any active vendor when NO location context at all was provided
  const hasLocationContext = Boolean((latitude && longitude) || pincode);
  if (!nearestVendor && !hasLocationContext) {
    nearestVendor = await Vendor.findOne({
      status: "approved",
      accountStatus: "active"
    });
  }

  return nearestVendor;
};

// GET /api/customer/wishlist
export const getWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const { latitude, longitude, pincode } = req.query;

    // Fetch customer's wishlist items
    const wishlistItems = await Wishlist.find({ userId }).populate("productId");

    // Filter out items if the underlying product was deleted
    const activeWishlistItems = wishlistItems.filter(item => item.productId && !item.productId.isDeleted);

    if (activeWishlistItems.length === 0) {
      return res.status(200).json({ success: true, wishlist: [] });
    }

    const productIds = activeWishlistItems.map(item => item.productId._id);

    // Resolve nearest vendor for prices/stock mapping
    const nearestVendor = await findNearestVendor(latitude, longitude, pincode);

    // If no vendor is active, we fall back to base prices
    let vendorProductsMap = new Map();
    let listedProductIdsFromListing = [];
    let linkedProductIds = [];

    if (nearestVendor) {
      // Find listings
      const matchingListings = await VendorListing.find({
        vendorId: nearestVendor._id,
        isAvailable: true,
        "stock.quantity": { $gt: 0 }
      }).select("variantId");

      const listedVariantIds = matchingListings.map((l) => l.variantId);
      const listedVariants = await ProductVariant.find({ _id: { $in: listedVariantIds } }).select("productId");
      listedProductIdsFromListing = listedVariants.map((v) => v.productId.toString());

      // Find VendorProduct links
      const matchingVendorProducts = await VendorProduct.find({
        vendorId: nearestVendor._id,
        status: "active",
        stock: { $gt: 0 }
      });
      linkedProductIds = matchingVendorProducts.map((vp) => vp.masterProductId.toString());
      vendorProductsMap = new Map(matchingVendorProducts.map((vp) => [vp.masterProductId.toString(), vp]));
    }

    // Fetch the products with full population
    const products = await Product.find({ _id: { $in: productIds } })
      .populate("categoryId", "name slug")
      .populate("subCategoryId", "name slug")
      .populate("familyId", "name slug")
      .populate({
        path: "variants",
        populate: {
          path: "vendorListings",
          match: nearestVendor ? { vendorId: nearestVendor._id, isAvailable: true } : {}
        }
      });

    // Map each product to resolve variant details, prices, and stock
    const mappedProducts = [];
    for (const product of products) {
      const variantsList = [];
      const vpLink = vendorProductsMap.get(product._id.toString());

      if (vpLink) {
        const linkPrice = vpLink.price;
        const linkStock = vpLink.stock;

        if (product.variants && product.variants.length > 0) {
          for (const variant of product.variants) {
            const mrp = variant.mrp || linkPrice;
            variantsList.push({
              _id: variant._id,
              variantLabel: variant.variantLabel,
              packSize: variant.packSize,
              sku: vpLink.sku || variant.sku,
              barcode: variant.barcode,
              images: variant.images && variant.images.length > 0 ? variant.images : product.images,
              mrp,
              sellingPrice: linkPrice,
              discount: mrp > linkPrice ? Math.round(((mrp - linkPrice) / mrp) * 100) : 0,
              stockQty: linkStock,
              stockStatus: linkStock > 0 ? "in_stock" : "out_of_stock",
              vendorId: nearestVendor._id,
              vendorName: nearestVendor.shopName
            });
          }
        } else {
          variantsList.push({
            _id: product._id,
            variantLabel: "Standard",
            packSize: { value: 1, unit: product.unitType === "weight" ? "kg" : "pcs" },
            sku: vpLink.sku,
            images: product.images,
            mrp: linkPrice,
            sellingPrice: linkPrice,
            discount: 0,
            stockQty: linkStock,
            stockStatus: linkStock > 0 ? "in_stock" : "out_of_stock",
            vendorId: nearestVendor._id,
            vendorName: nearestVendor.shopName
          });
        }
      } else {
        // Standard flow
        for (const variant of (product.variants || [])) {
          const listings = variant.vendorListings || [];
          let sellingPrice = variant.basePrice;
          let mrp = variant.mrp;
          let stockQty = 0;

          if (nearestVendor) {
            const matchingListing = listings.find((l) => l.vendorId.toString() === nearestVendor._id.toString());
            if (matchingListing) {
              sellingPrice = matchingListing.sellingPrice;
              stockQty = matchingListing.stock?.quantity ?? 0;
            } else {
              // check if vendor-created
              if (product.creatorModel === "Vendor" && product.createdBy?.toString() === nearestVendor._id.toString()) {
                sellingPrice = variant.basePrice;
                stockQty = 15;
              } else {
                continue; // skip variant if this vendor doesn't list it
              }
            }
          } else {
            stockQty = 15; // default fallback if no vendor
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
            vendorId: nearestVendor?._id || null,
            vendorName: nearestVendor?.shopName || "GAONKART Partner"
          });
        }
      }

      // If no active variant found for this vendor, map with standard catalog data
      if (variantsList.length === 0 && product.variants && product.variants.length > 0) {
        for (const variant of product.variants) {
          variantsList.push({
            _id: variant._id,
            variantLabel: variant.variantLabel,
            packSize: variant.packSize,
            sku: variant.sku,
            barcode: variant.barcode,
            images: variant.images && variant.images.length > 0 ? variant.images : product.images,
            mrp: variant.mrp,
            sellingPrice: variant.basePrice,
            discount: variant.mrp > variant.basePrice ? Math.round(((variant.mrp - variant.basePrice) / variant.mrp) * 100) : 0,
            stockQty: 0,
            stockStatus: "out_of_stock",
            vendorId: null,
            vendorName: "Out of Stock"
          });
        }
      }

      // Fallback virtual variant
      if (variantsList.length === 0) {
        variantsList.push({
          _id: product._id,
          variantLabel: "Standard",
          packSize: { value: 1, unit: product.unitType === "weight" ? "kg" : "pcs" },
          images: product.images,
          mrp: 0,
          sellingPrice: 0,
          discount: 0,
          stockQty: 0,
          stockStatus: "out_of_stock",
          vendorId: null,
          vendorName: "Out of Stock"
        });
      }

      const primaryVariant = variantsList[0];
      mappedProducts.push({
        _id: product._id,
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
        variants: variantsList,
        primaryPrice: primaryVariant.sellingPrice,
        primaryMrp: primaryVariant.mrp,
        primaryDiscount: primaryVariant.discount,
        primaryUnit: primaryVariant.variantLabel,
        primaryStockStatus: primaryVariant.stockStatus,
        primaryVendorName: primaryVariant.vendorName,
        primaryVendorId: primaryVariant.primaryVendorId
      });
    }

    res.status(200).json({
      success: true,
      wishlist: mappedProducts
    });
  } catch (error) {
    console.error("Get Wishlist Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/customer/wishlist/:productId
export const addToWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;

    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID." });
    }

    // Check if product exists and is not deleted
    const product = await Product.findOne({ _id: productId, isDeleted: { $ne: true } });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }

    // Upsert / find existing
    const existing = await Wishlist.findOne({ userId, productId });
    if (existing) {
      return res.status(200).json({ success: true, message: "Product already in wishlist.", wishlist: existing });
    }

    const newItem = await Wishlist.create({ userId, productId });
    res.status(201).json({ success: true, message: "Product added to wishlist.", wishlist: newItem });
  } catch (error) {
    console.error("Add To Wishlist Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/customer/wishlist/:productId
export const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;

    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID." });
    }

    const result = await Wishlist.findOneAndDelete({ userId, productId });
    if (!result) {
      return res.status(404).json({ success: false, message: "Product not found in wishlist." });
    }

    res.status(200).json({ success: true, message: "Product removed from wishlist." });
  } catch (error) {
    console.error("Remove From Wishlist Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
