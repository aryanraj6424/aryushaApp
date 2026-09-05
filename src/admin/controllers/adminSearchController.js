import Vendor from "../../vendor/models/Vendor.js";
import { Product } from "../../models/catalog.js";
import CustomerOrder from "../../customer/models/CustomerOrder.js";

// @desc    Unified global search across vendors, products & orders for Super Admin
// @route   GET /api/admin/search?query=...
// @access  Private (Admin)
export const searchAdminEntities = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(200).json({
        success: true,
        vendors: [],
        products: [],
        orders: []
      });
    }

    const rawSearch = query.trim();
    const cleanSearch = rawSearch.replace(/^#/, "").trim();

    if (cleanSearch.length < 2) {
      return res.status(200).json({
        success: true,
        vendors: [],
        products: [],
        orders: []
      });
    }

    const regex = new RegExp(cleanSearch, "i");

    // 1. Search Vendors (shopName, storeDetails.storeName, ownerDetails.fullName, ownerDetails.ownerName, businessEmail, phone)
    const vendors = await Vendor.find({
      $or: [
        { shopName: regex },
        { "storeDetails.storeName": regex },
        { "ownerDetails.fullName": regex },
        { "ownerDetails.ownerName": regex },
        { businessEmail: regex },
        { phone: regex }
      ]
    })
    .select("shopName storeDetails ownerDetails businessEmail phone status accountStatus createdAt")
    .limit(5)
    .lean();

    // 2. Search Products platform-wide (name, brand, category)
    const products = await Product.find({
      isDeleted: { $ne: true },
      $or: [
        { name: regex },
        { brand: regex },
        { category: regex }
      ]
    })
    .select("name brand images price category status creatorModel")
    .limit(5)
    .lean();

    // 3. Search Orders platform-wide (orderId, customer name, status)
    const orders = await CustomerOrder.find({
      $or: [
        { orderId: regex },
        { "deliveryAddress.fullName": regex },
        { orderStatus: regex }
      ]
    })
    .select("orderId grandTotal orderStatus deliveryStatus createdAt deliveryAddress")
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

    res.status(200).json({
      success: true,
      vendors,
      products,
      orders
    });
  } catch (error) {
    console.error("Admin Search Error:", error);
    res.status(500).json({ success: false, message: "Admin Search Failed" });
  }
};
