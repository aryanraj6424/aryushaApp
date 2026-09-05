import Vendor from "../models/Vendor.js";
import VendorPermission from "../models/VendorPermission.js";
import VendorEarnings from "../models/VendorEarnings.js";
import Settlement from "../models/Settlement.js";
import { createAdminNotification } from "../../utils/adminNotificationHelper.js";
import Commission from "../models/Commission.js";
import CommissionLedger from "../models/CommissionLedger.js";
import Order from "../models/Order.js";
import { Product, ProductVariant } from "../../models/catalog.js";
import CustomerOrder from "../../customer/models/CustomerOrder.js";
import DeliveryBoy from "../../deliveryBoy/models/DeliveryBoy.js";
import { emitToRoom } from "../../socket/socketManager.js";
import RiderNotification from "../../deliveryBoy/models/RiderNotification.js";
import PlatformFeeSettings from "../../admin/models/PlatformFeeSettings.js";
import { calculateCommissionSync } from "../../utils/commissionCalculator.js";
import { formatVendorScopedOrder } from "../../utils/financeSerializer.js";
import mongoose from "mongoose";
import { handleOrderStatusChange, runInTransaction } from "../../utils/ledgerSyncHelper.js";

const ensureMockOrders = async (vendorId) => {
  // Disabled mock seeder to use real live data only
  return;
};

// Vendor Dashboard
export const getVendorDashboard = async (req, res) => {
  try {
    const vendorId = req.vendor._id;

    const vendor = await Vendor.findById(vendorId);
    
    const platformSettings = await PlatformFeeSettings.findOne() || {
      defaultCommissionType: "percentage",
      defaultCommissionValue: 8
    };

    const commType = vendor?.commissionValue !== null && vendor?.commissionValue !== undefined && vendor?.commissionValue !== ""
      ? vendor.commissionType 
      : platformSettings.defaultCommissionType || "percentage";
      
    const commVal = vendor?.commissionValue !== null && vendor?.commissionValue !== undefined && vendor?.commissionValue !== ""
      ? vendor.commissionValue 
      : platformSettings.defaultCommissionValue ?? 8;

    // Fetch all real customer orders for this vendor
    const realOrders = await CustomerOrder.find({ vendorId })
      .populate("customerId", "fullName email phoneNumber")
      .sort({ createdAt: -1 });

    const mappedOrders = realOrders.map(order => {
      const commission = calculateCommissionSync(order, commType, commVal);
      const netAmount = order.totalAmount - commission;
      
      let status = "pending";
      if (order.orderStatus === "Delivered") {
        status = "completed";
      } else if (order.orderStatus === "Cancelled" || order.orderStatus === "Rejected") {
        status = "cancelled";
      } else if (order.orderStatus === "Accepted" || order.orderStatus === "Packed") {
        status = "processing";
      }

      return {
        orderId: order.orderId,
        customerName: order.customerId?.fullName || order.deliveryAddress?.fullName || "Customer",
        totalAmount: order.totalAmount,
        commission,
        netAmount,
        status,
        createdAt: order.createdAt
      };
    });

    // Dynamic calculations from the commission ledger (Single Source of Truth)
    const activeLedgerEntries = await CommissionLedger.find({
      vendorId,
      orderStatus: "Delivered"
    });

    const totalSales = activeLedgerEntries.reduce((sum, entry) => sum + entry.orderAmount, 0);
    const commissionPaid = activeLedgerEntries.reduce((sum, entry) => sum + entry.commissionAmount, 0);
    const netRevenue = totalSales - commissionPaid;

    let earnings = await VendorEarnings.findOne({ vendor: vendorId });
    if (!earnings) {
      earnings = await VendorEarnings.create({
        vendor: vendorId,
        totalSales,
        grossRevenue: totalSales,
        netRevenue,
        commissionPaid,
        walletBalance: netRevenue,
        pendingBalance: 0,
        settledBalance: 0,
      });
    } else {
      earnings.totalSales = totalSales;
      earnings.grossRevenue = totalSales;
      earnings.netRevenue = netRevenue;
      earnings.commissionPaid = commissionPaid;
      // Auto-update wallet balance keeping track of withdrawals
      earnings.walletBalance = Math.max(0, netRevenue - (earnings.pendingBalance + earnings.settledBalance));
      await earnings.save();
    }

    const totalProducts = await Product.countDocuments({
      createdBy: vendorId,
      creatorModel: "Vendor",
      isDeleted: { $ne: true }
    });

    // Fetch top selling products
    const topSellingRaw = await CustomerOrder.aggregate([
      {
        $match: {
          orderStatus: { $nin: ["Cancelled", "Rejected"] },
          $or: [
            { vendorId: vendorId },
            { "vendorSubOrders.vendorId": vendorId }
          ]
        }
      },
      {
        $project: {
          itemsToUse: {
            $cond: {
              if: { $eq: ["$vendorId", vendorId] },
              then: "$items",
              else: {
                $reduce: {
                  input: "$vendorSubOrders",
                  initialValue: [],
                  in: {
                    $cond: {
                      if: {
                        $and: [
                          { $eq: ["$$this.vendorId", vendorId] },
                          { $not: [{ $in: ["$$this.subOrderStatus", ["Cancelled", "Rejected"]] }] }
                        ]
                      },
                      then: { $concatArrays: ["$$value", "$$this.items"] },
                      else: "$$value"
                    }
                  }
                }
              }
            }
          }
        }
      },
      { $unwind: "$itemsToUse" },
      {
        $group: {
          _id: {
            productId: "$itemsToUse.productId",
            variantId: "$itemsToUse.variantId"
          },
          name: { $first: "$itemsToUse.name" },
          img: { $first: "$itemsToUse.img" },
          totalQtySold: { $sum: "$itemsToUse.qty" },
          totalRevenue: { $sum: { $multiply: ["$itemsToUse.price", "$itemsToUse.qty"] } },
          ordersSet: { $addToSet: "$_id" }
        }
      },
      {
        $project: {
          _id: 0,
          productId: "$_id.productId",
          variantId: "$_id.variantId",
          name: 1,
          img: 1,
          totalQtySold: 1,
          totalRevenue: 1,
          distinctOrdersCount: { $size: "$ordersSet" }
        }
      },
      { $sort: { totalQtySold: -1, totalRevenue: -1 } },
      { $limit: 5 }
    ]);

    const variantIds = topSellingRaw.map(item => item.variantId).filter(Boolean);
    const productIds = topSellingRaw.map(item => item.productId).filter(Boolean);

    const [variants, products] = await Promise.all([
      ProductVariant.find({ _id: { $in: variantIds } }).lean(),
      Product.find({ _id: { $in: productIds } }).lean()
    ]);

    const variantMap = new Map(variants.map(v => [v._id.toString(), v]));
    const productMap = new Map(products.map(p => [p._id.toString(), p]));

    const topSelling = topSellingRaw.map(item => {
      const variant = variantMap.get(item.variantId?.toString());
      const product = productMap.get(item.productId?.toString());

      let packSize = "";
      if (variant?.variantLabel) {
        packSize = variant.variantLabel;
      } else if (variant?.packSize?.value) {
        packSize = `${variant.packSize.value} ${variant.packSize.unit || ""}`.trim();
      }

      return {
        productId: item.productId,
        variantId: item.variantId,
        name: item.name || product?.name || "Product",
        packSize,
        img: item.img || variant?.images?.[0] || product?.images?.[0] || "",
        totalQtySold: item.totalQtySold,
        totalRevenue: Number(item.totalRevenue.toFixed(2)),
        distinctOrdersCount: item.distinctOrdersCount
      };
    });

    res.status(200).json({
      success: true,
      vendor,
      earnings,
      orders: mappedOrders,
      totalProducts,
      topSelling
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Vendor Profile Self
export const getVendorProfile = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendor._id);
    res.status(200).json({
      success: true,
      vendor,
      allowLocationEdit: process.env.ALLOW_VENDOR_LOCATION_EDIT === "true"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Vendor Permissions Self
export const getVendorPermissionsSelf = async (req, res) => {
  try {
    let permissions = await VendorPermission.findOne({ vendor: req.vendor._id });
    if (!permissions) {
      permissions = await VendorPermission.create({
        vendor: req.vendor._id,
        permissions: {
          category: { view: true, add: true, edit: true, delete: true },
          subCategory: { view: true, add: true, edit: true, delete: true },
          productFamily: { view: true, add: true, edit: true, delete: true },
          areaAccess: { view: true },
          couponAccess: { view: true, create: true, edit: true, delete: true },
          product: { view: true, add: true, edit: true, delete: true },
        },
      });
    } else {
      let modified = false;
      if (!permissions.permissions.product) {
        permissions.permissions.product = { view: true, add: true, edit: true, delete: true };
        modified = true;
      }
      if (!permissions.permissions.commissionEditAccess) {
        permissions.permissions.commissionEditAccess = { edit: false };
        modified = true;
      }
      if (modified) {
        permissions.markModified("permissions");
        await permissions.save();
      }
    }
    res.status(200).json({ success: true, permissions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Vendor Earnings Self
export const getVendorEarningsSelf = async (req, res) => {
  try {
    const vendorId = req.vendor._id;

    const vendor = await Vendor.findById(vendorId);
    const platformSettings = await PlatformFeeSettings.findOne() || {
      defaultCommissionType: "percentage",
      defaultCommissionValue: 8
    };

    const commType = vendor?.commissionValue !== null && vendor?.commissionValue !== undefined && vendor?.commissionValue !== ""
      ? vendor.commissionType 
      : platformSettings.defaultCommissionType || "percentage";
      
    const commVal = vendor?.commissionValue !== null && vendor?.commissionValue !== undefined && vendor?.commissionValue !== ""
      ? vendor.commissionValue 
      : platformSettings.defaultCommissionValue ?? 8;

    // Dynamic calculations from the commission ledger (Single Source of Truth)
    const activeLedgerEntries = await CommissionLedger.find({
      vendorId,
      orderStatus: "Delivered"
    });

    const totalSales = activeLedgerEntries.reduce((sum, entry) => sum + entry.orderAmount, 0);
    const commissionPaid = activeLedgerEntries.reduce((sum, entry) => sum + entry.commissionAmount, 0);
    const netRevenue = totalSales - commissionPaid;

    // Get current earnings config
    let earnings = await VendorEarnings.findOne({ vendor: vendorId });
    if (!earnings) {
      earnings = await VendorEarnings.create({
        vendor: vendorId,
        totalSales,
        grossRevenue: totalSales,
        netRevenue,
        commissionPaid,
        walletBalance: netRevenue,
        pendingBalance: 0,
        settledBalance: 0,
      });
    } else {
      earnings.totalSales = totalSales;
      earnings.grossRevenue = totalSales;
      earnings.netRevenue = netRevenue;
      earnings.commissionPaid = commissionPaid;
      // Auto-update wallet balance keeping track of withdrawals
      earnings.walletBalance = Math.max(0, netRevenue - (earnings.pendingBalance + earnings.settledBalance));
      await earnings.save();
    }

    res.status(200).json({ success: true, earnings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Settlements History Self
export const getVendorSettlementsSelf = async (req, res) => {
  try {
    const vendorId = req.vendor._id;
    await ensureMockOrders(vendorId);

    const settlements = await Settlement.find({ vendor: vendorId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, settlements });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Request Withdrawal / Payout Request
export const requestWithdrawalSelf = async (req, res) => {
  try {
    const vendorId = req.vendor._id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Please provide a valid withdrawal amount" });
    }

    const earnings = await VendorEarnings.findOne({ vendor: vendorId });
    if (!earnings || earnings.walletBalance < amount) {
      return res.status(400).json({ success: false, message: "Insufficient wallet balance" });
    }

    // Deduct from wallet and add to pending balance
    earnings.walletBalance -= amount;
    earnings.pendingBalance += amount;
    await earnings.save();

    // Fetch vendor documents bankDetails if any
    const vendor = await Vendor.findById(vendorId);

    const settlement = await Settlement.create({
      vendor: vendorId,
      amount,
      status: "pending",
      bankDetails: {
        accountHolder: vendor?.documents?.bankDetails?.accountHolder || "Vendor Account",
        accountNumber: vendor?.documents?.bankDetails?.accountNumber || "",
        ifsc: vendor?.documents?.bankDetails?.ifsc || "",
        bankName: vendor?.documents?.bankDetails?.bankName || "",
      },
    });

    // Trigger Admin Notification for Payout Request
    await createAdminNotification({
      title: "Payout Withdrawal Request 💳",
      message: `Payout withdrawal request of ₹${amount} submitted by "${vendor?.storeDetails?.storeName || vendor?.shopName || 'Vendor'}"`,
      type: "PAYOUT_REQUESTED",
      relatedVendorId: vendorId
    });

    res.status(201).json({
      success: true,
      message: "Withdrawal request submitted successfully",
      settlement,
      earnings,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Commission Details Self
export const getVendorCommissionSelf = async (req, res) => {
  try {
    const vendorId = req.vendor._id;

    const vendor = await Vendor.findById(vendorId);
    const platformSettings = await PlatformFeeSettings.findOne() || {
      defaultCommissionType: "percentage",
      defaultCommissionValue: 8
    };

    const commType = vendor?.commissionValue !== null && vendor?.commissionValue !== undefined && vendor?.commissionValue !== ""
      ? vendor.commissionType 
      : platformSettings.defaultCommissionType || "percentage";
      
    const commVal = vendor?.commissionValue !== null && vendor?.commissionValue !== undefined && vendor?.commissionValue !== ""
      ? vendor.commissionValue 
      : platformSettings.defaultCommissionValue ?? 8;

    let commission = await Commission.findOne({ vendor: vendorId });
    if (!commission) {
      commission = await Commission.create({ vendor: vendorId, rate: commVal });
    } else {
      commission.rate = commVal;
      await commission.save();
    }

    // Recalculate based on orders
    const completedOrders = await CustomerOrder.find({ vendorId, orderStatus: "Delivered" });
    const calculatedCommission = completedOrders.reduce((sum, o) => sum + calculateCommissionSync(o, commType, commVal), 0);

    commission.calculatedCommission = calculatedCommission;
    await commission.save();

    res.status(200).json({ success: true, commission });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Sales Report from actual orders in MongoDB
export const getVendorSalesReportSelf = async (req, res) => {
  try {
    const vendorId = req.vendor._id;

    const vendor = await Vendor.findById(vendorId);
    const platformSettings = await PlatformFeeSettings.findOne() || {
      defaultCommissionType: "percentage",
      defaultCommissionValue: 8
    };

    const commType = vendor?.commissionValue !== null && vendor?.commissionValue !== undefined && vendor?.commissionValue !== ""
      ? vendor.commissionType 
      : platformSettings.defaultCommissionType || "percentage";
      
    const commVal = vendor?.commissionValue !== null && vendor?.commissionValue !== undefined && vendor?.commissionValue !== ""
      ? vendor.commissionValue 
      : platformSettings.defaultCommissionValue ?? 8;

    // Fetch all real customer orders for this vendor
    const realOrders = await CustomerOrder.find({ vendorId })
      .populate("customerId", "fullName email phoneNumber")
      .sort({ createdAt: -1 });

    const mappedOrders = realOrders.map(order => {
      const commission = calculateCommissionSync(order, commType, commVal);
      const netAmount = order.grandTotal - commission;
      
      let status = "pending";
      if (order.orderStatus === "Delivered") {
        status = "completed";
      } else if (order.orderStatus === "Cancelled" || order.orderStatus === "Rejected") {
        status = "cancelled";
      } else if (order.orderStatus === "Accepted" || order.orderStatus === "Packed") {
        status = "processing";
      }

      return {
        orderId: order.orderId,
        customerName: order.customerId?.fullName || order.deliveryAddress?.fullName || "Customer",
        totalAmount: order.grandTotal,
        commission,
        netAmount,
        status,
        createdAt: order.createdAt
      };
    });

    const totalOrdersCount = mappedOrders.length;
    const completedOrders = mappedOrders.filter((o) => o.status === "completed");
    const totalSalesRevenue = completedOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalCommissionDeducted = completedOrders.reduce((sum, o) => sum + o.commission, 0);
    const totalNetPayout = completedOrders.reduce((sum, o) => sum + o.netAmount, 0);

    // Group sales by date for report chart
    const dailySales = {};
    completedOrders.forEach((order) => {
      const dateStr = new Date(order.createdAt).toISOString().split("T")[0];
      if (!dailySales[dateStr]) {
        dailySales[dateStr] = { date: dateStr, sales: 0, revenue: 0 };
      }
      dailySales[dateStr].sales += 1;
      dailySales[dateStr].revenue += order.totalAmount;
    });

    const reportData = Object.values(dailySales).sort((a, b) => a.date.localeCompare(b.date));

    res.status(200).json({
      success: true,
      summary: {
        totalOrdersCount,
        completedOrdersCount: completedOrders.length,
        totalSalesRevenue,
        totalCommissionDeducted,
        totalNetPayout,
      },
      chartData: reportData,
      orders: mappedOrders,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Vendor Profile Self (Coordinates, Radius, Service Areas)
export const updateVendorProfileSelf = async (req, res) => {
  try {
    const vendorId = req.vendor._id;
    const { latitude, longitude, deliveryRadius, serviceAreas } = req.body;

    // Check if vendor tries to edit location coordinates or radius, and configuration disallows it
    const isEditingLocation =
      (latitude !== undefined) ||
      (longitude !== undefined) ||
      (deliveryRadius !== undefined);

    if (isEditingLocation && process.env.ALLOW_VENDOR_LOCATION_EDIT !== "true") {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to edit store coordinates or delivery radius. Please contact administration."
      });
    }

    // Validation rules
    if (latitude !== undefined && latitude !== null && latitude !== "") {
      const latNum = Number(latitude);
      if (isNaN(latNum) || latNum < -90 || latNum > 90) {
        return res.status(400).json({ success: false, message: "Invalid latitude. Must be between -90 and 90." });
      }
    }
    if (longitude !== undefined && longitude !== null && longitude !== "") {
      const lngNum = Number(longitude);
      if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
        return res.status(400).json({ success: false, message: "Invalid longitude. Must be between -180 and 180." });
      }
    }
    if (deliveryRadius !== undefined && deliveryRadius !== null && deliveryRadius !== "") {
      const radNum = Number(deliveryRadius);
      if (isNaN(radNum) || radNum < 0) {
        return res.status(400).json({ success: false, message: "Invalid delivery radius. Must be a positive number." });
      }
    }
    if (serviceAreas !== undefined) {
      if (!Array.isArray(serviceAreas)) {
        return res.status(400).json({ success: false, message: "Service areas must be an array." });
      }
      const pincodes = new Set();
      for (const sa of serviceAreas) {
        if (!sa.pincode || !sa.areaName || !sa.city || !sa.state) {
          return res.status(400).json({ success: false, message: "Each service area must contain pincode, areaName, city, and state." });
        }
        if (pincodes.has(sa.pincode)) {
          return res.status(400).json({ success: false, message: `Duplicate pincode found: ${sa.pincode}` });
        }
        pincodes.add(sa.pincode);
      }
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }

    if (latitude !== undefined) vendor.latitude = (latitude === null || latitude === "") ? null : Number(latitude);
    if (longitude !== undefined) vendor.longitude = (longitude === null || longitude === "") ? null : Number(longitude);
    if (deliveryRadius !== undefined) vendor.deliveryRadius = (deliveryRadius === null || deliveryRadius === "") ? null : Number(deliveryRadius);
    if (serviceAreas !== undefined) vendor.serviceAreas = serviceAreas;

    if (req.body.shopName !== undefined) vendor.shopName = req.body.shopName;
    if (req.body.phone !== undefined) vendor.phone = req.body.phone;
    if (req.body.businessEmail !== undefined) vendor.businessEmail = req.body.businessEmail;
    if (req.body.whatsapp !== undefined) vendor.whatsapp = req.body.whatsapp;

    if (req.body.address !== undefined) {
      vendor.address = {
        ...(vendor.address || {}),
        ...req.body.address
      };
    }
    if (req.body.ownerDetails !== undefined) {
      vendor.ownerDetails = {
        ...(vendor.ownerDetails || {}),
        ...req.body.ownerDetails
      };
    }
    if (req.body.storeDetails !== undefined) {
      vendor.storeDetails = {
        ...(vendor.storeDetails || {}),
        ...req.body.storeDetails
      };
    }
    if (req.body.documents !== undefined) {
      const docs = req.body.documents || {};
      // Preserve existing sensitive fields: gstNumber, businessRegNo, aadhaar, pan, bankDetails
      const { gstNumber, businessRegNo, aadhaar, pan, bankDetails, ...allowedDocs } = docs;
      vendor.documents = {
        ...(vendor.documents || {}),
        ...allowedDocs,
      };
    }

    await vendor.save();
    res.status(200).json({ success: true, message: "Vendor profile updated successfully", vendor });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Vendor Order Management Endpoints
export const getVendorOrders = async (req, res) => {
  try {
    const vendorId = req.vendor._id;
    const rawOrders = await CustomerOrder.find({
      $or: [{ vendorId }, { "vendorSubOrders.vendorId": vendorId }]
    })
      .populate("customerId", "fullName email phoneNumber")
      .populate("deliveryBoyId", "fullName phone")
      .populate({
        path: "items.variantId",
        select: "variantLabel packSize name sku"
      })
      .populate({
        path: "vendorSubOrders.items.variantId",
        select: "variantLabel packSize name sku"
      })
      .sort({ createdAt: -1 });

    const orders = rawOrders.map(order => formatVendorScopedOrder(order, vendorId));

    res.status(200).json({
      success: true,
      orders
    });
  } catch (error) {
    console.error("Get Vendor Orders Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const assignDeliveryBoy = async (req, res) => {
  try {
    const { deliveryBoyId } = req.body;
    const orderId = req.params.id;
    const vendorId = req.vendor._id;

    if (!deliveryBoyId) {
      return res.status(400).json({ success: false, message: "Delivery Boy ID is required" });
    }

    const order = await CustomerOrder.findOne({ _id: orderId, vendorId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Constraint: Dispatch readiness check
    if (order.orderStatus === "Pending") {
      return res.status(400).json({
        success: false,
        message: "Order is not yet ready for dispatch. You must accept/pack it first."
      });
    }

    if (["Delivered", "Rejected", "Cancelled"].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot assign delivery boy to an order that is ${order.orderStatus.toLowerCase()}.`
      });
    }

    const rider = await DeliveryBoy.findById(deliveryBoyId);
    if (!rider || rider.status !== "approved" || rider.accountStatus !== "active") {
      return res.status(400).json({ success: false, message: "Delivery boy is not available or inactive" });
    }

    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

    order.deliveryBoyId = deliveryBoyId;
    order.deliveryStatus = "Assigned";
    order.deliveryOtp = otpCode;

    order.deliveryLogs.push({
      status: "Assigned",
      timestamp: new Date(),
      note: `Order assigned to rider ${rider.fullName} with verification OTP: ${otpCode}`
    });

    await order.save();

    // Create persistent notification for delivery boy
    await RiderNotification.create({
      deliveryBoyId,
      title: "New Delivery Assigned! 📦",
      message: `A new order (${order.orderId}) has been assigned to you.`,
      type: "order"
    });

    // Notify the assigned delivery boy in real-time
    emitToRoom(`deliveryBoy:${deliveryBoyId}`, "order:assigned", {
      orderId: order._id,
      orderRef: order.orderId,
      message: "A new order has been assigned to you."
    });
    // Notify admin
    emitToRoom("admin:global", "order:assigned", { orderId: order._id, orderRef: order.orderId });

    res.status(200).json({
      success: true,
      message: "Delivery boy assigned successfully",
      order
    });
  } catch (error) {
    console.error("Assign Delivery Boy Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const reassignDeliveryBoy = async (req, res) => {
  try {
    const { deliveryBoyId } = req.body;
    const orderId = req.params.id;
    const vendorId = req.vendor._id;

    if (!deliveryBoyId) {
      return res.status(400).json({ success: false, message: "Delivery Boy ID is required" });
    }

    const order = await CustomerOrder.findOne({ _id: orderId, vendorId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Constraint: Reassignment is blocked once order status is "Picked Up" or later
    if (order.deliveryStatus !== "Assigned" && order.deliveryStatus !== "None") {
      return res.status(400).json({
        success: false,
        message: "Reassignment blocked: Order has already been picked up or delivered by the rider."
      });
    }

    const rider = await DeliveryBoy.findById(deliveryBoyId);
    if (!rider || rider.status !== "approved" || rider.accountStatus !== "active") {
      return res.status(400).json({ success: false, message: "Delivery boy is not available or inactive" });
    }

    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

    order.deliveryBoyId = deliveryBoyId;
    order.deliveryStatus = "Assigned";
    order.deliveryOtp = otpCode;

    order.deliveryLogs.push({
      status: "Assigned",
      timestamp: new Date(),
      note: `Order reassigned to rider ${rider.fullName} with verification OTP: ${otpCode}`
    });

    await order.save();

    // Create persistent notification for newly assigned delivery boy
    await RiderNotification.create({
      deliveryBoyId,
      title: "New Delivery Assigned! 📦",
      message: `An order (${order.orderId}) has been reassigned to you.`,
      type: "order"
    });

    // Notify newly assigned delivery boy and admin
    emitToRoom(`deliveryBoy:${deliveryBoyId}`, "order:assigned", {
      orderId: order._id,
      orderRef: order.orderId,
      message: "An order has been reassigned to you."
    });
    emitToRoom("admin:global", "order:assigned", { orderId: order._id, orderRef: order.orderId });

    res.status(200).json({
      success: true,
      message: "Delivery boy reassigned successfully",
      order
    });
  } catch (error) {
    console.error("Reassign Delivery Boy Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const getOrderDeliveryStatus = async (req, res) => {
  try {
    const orderId = req.params.id;
    const vendorId = req.vendor._id;

    const order = await CustomerOrder.findOne({ _id: orderId, vendorId })
      .populate("deliveryBoyId", "fullName phone vehicleDetails status accountStatus");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    res.status(200).json({
      success: true,
      deliveryStatus: order.deliveryStatus,
      deliveryOtp: order.deliveryOtp,
      deliveryLogs: order.deliveryLogs,
      deliveryBoy: order.deliveryBoyId || null
    });
  } catch (error) {
    console.error("Get Order Delivery Status Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const listActiveDeliveryBoys = async (req, res) => {
  try {
    const riders = await DeliveryBoy.find({
      status: "approved",
      accountStatus: "active"
    }).select("fullName phone vehicleDetails latitude longitude");

    // Compute activeLoad count dynamically for each rider
    const ridersWithLoad = await Promise.all(
      riders.map(async (rider) => {
        const activeLoad = await CustomerOrder.countDocuments({
          deliveryBoyId: rider._id,
          deliveryStatus: { $in: ["Assigned", "Picked_Up", "On_the_Way", "Reached_Customer"] }
        });
        return {
          ...rider.toObject(),
          activeLoad
        };
      })
    );

    res.status(200).json({
      success: true,
      riders: ridersWithLoad
    });
  } catch (error) {
    console.error("List Active Delivery Boys Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const acceptOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const vendorId = req.vendor._id;
    let resultOrder = null;

    await runInTransaction(async (session) => {
      const order = await CustomerOrder.findOne({
        _id: orderId,
        $or: [{ vendorId }, { "vendorSubOrders.vendorId": vendorId }]
      })
        .populate("customerId", "fullName email phoneNumber")
        .populate("deliveryBoyId", "fullName phone")
        .session(session);

      if (!order) {
        throw new Error("Order not found");
      }

      const subOrder = (order.vendorSubOrders || []).find(s => s.vendorId.toString() === vendorId.toString());
      if (subOrder) {
        if (subOrder.subOrderStatus !== "Pending") {
          throw new Error("Your portion of this order is already accepted or processed");
        }
        subOrder.subOrderStatus = "Accepted";
      }

      // Compute aggregate parent order status
      const subStatuses = (order.vendorSubOrders || []).map(s => s.subOrderStatus);
      const allAccepted = subStatuses.every(s => s === "Accepted" || s === "Packed" || s === "Delivered");
      const allRejected = subStatuses.every(s => s === "Rejected" || s === "Cancelled");

      if (allAccepted) {
        order.orderStatus = "Accepted";
      } else if (allRejected) {
        order.orderStatus = "Rejected";
      } else if (subStatuses.some(s => s === "Accepted" || s === "Packed")) {
        order.orderStatus = "Partially_Accepted";
      }

      await order.save({ session });

      // Sync status in the commission ledger
      await handleOrderStatusChange(order._id, order.orderStatus, session);
      resultOrder = order;
    });

    // Notify customer that their order was accepted
    if (resultOrder.customerId) {
      emitToRoom(`customer:${resultOrder.customerId._id || resultOrder.customerId}`, "order:accepted", {
        orderId: resultOrder._id,
        orderRef: resultOrder.orderId,
        message: "Your order has been accepted!"
      });
    }

    res.status(200).json({
      success: true,
      message: "Order accepted successfully",
      order: resultOrder
    });
  } catch (error) {
    console.error("Accept Order Error:", error);
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

export const rejectOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const vendorId = req.vendor._id;
    const { reason } = req.body;
    let resultOrder = null;

    await runInTransaction(async (session) => {
      const order = await CustomerOrder.findOne({
        _id: orderId,
        $or: [{ vendorId }, { "vendorSubOrders.vendorId": vendorId }]
      })
        .populate("customerId", "fullName email phoneNumber")
        .populate("deliveryBoyId", "fullName phone")
        .session(session);

      if (!order) {
        throw new Error("Order not found");
      }

      const subOrder = (order.vendorSubOrders || []).find(s => s.vendorId.toString() === vendorId.toString());
      if (subOrder) {
        if (subOrder.subOrderStatus !== "Pending") {
          throw new Error("Only pending orders can be rejected");
        }
        subOrder.subOrderStatus = "Rejected";
      }

      // Compute aggregate parent order status
      const subStatuses = (order.vendorSubOrders || []).map(s => s.subOrderStatus);
      const allRejected = subStatuses.every(s => s === "Rejected" || s === "Cancelled");
      const someAccepted = subStatuses.some(s => s === "Accepted" || s === "Packed" || s === "Delivered");

      if (allRejected) {
        order.orderStatus = "Rejected";
        order.deliveryStatus = "None";
      } else if (someAccepted) {
        order.orderStatus = "Partially_Accepted";
      }

      if (reason) {
        order.ratingFeedback = `${order.ratingFeedback ? order.ratingFeedback + " | " : ""}Vendor Rejection Reason: ${reason}`;
      }
      await order.save({ session });

      // Sync status in the commission ledger
      await handleOrderStatusChange(order._id, order.orderStatus, session);
      resultOrder = order;
    });

    // Notify customer and admin of order rejection
    if (resultOrder.customerId) {
      emitToRoom(`customer:${resultOrder.customerId._id || resultOrder.customerId}`, "order:rejected", {
        orderId: resultOrder._id,
        orderRef: resultOrder.orderId,
        message: "Vendor was unable to fulfill item(s) in your order."
      });
    }
    emitToRoom("admin:global", "order:rejected", { orderId: resultOrder._id, orderRef: resultOrder.orderId });

    res.status(200).json({
      success: true,
      message: "Sub-order rejected successfully",
      order: resultOrder
    });
  } catch (error) {
    console.error("Reject Order Error:", error);
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// @desc    Unified search across vendor's products & orders
// @route   GET /api/vendor/search?query=...
// @access  Private (Vendor)
export const searchVendorEntities = async (req, res) => {
  try {
    const vendorId = req.vendor._id;
    const { query } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(200).json({
        success: true,
        products: [],
        orders: []
      });
    }

    // Clean query & strip leading '#' for order ID matching (e.g. #QK-136795 -> QK-136795)
    const rawSearch = query.trim();
    const cleanSearch = rawSearch.replace(/^#/, "").trim();

    if (cleanSearch.length < 2) {
      return res.status(200).json({
        success: true,
        products: [],
        orders: []
      });
    }

    const regex = new RegExp(cleanSearch, "i");

    // 1. Search Vendor's Products (linked via VendorProduct / VendorListing or created by vendor)
    const { Product, VendorProduct, VendorListing } = await import("../../models/catalog.js");

    const vpLinks = await VendorProduct.find({ vendorId }).select("masterProductId stock").lean();
    const vpMap = new Map();
    const vendorProductIds = [];

    for (const link of vpLinks) {
      if (link && link.masterProductId) {
        const idStr = link.masterProductId.toString();
        vpMap.set(idStr, link.stock || 0);
        vendorProductIds.push(link.masterProductId);
      }
    }

    // Safely check VendorListing with null checks
    const listings = await VendorListing.find({ vendorId }).select("masterProductId").lean();
    for (const listing of listings) {
      if (listing && listing.masterProductId) {
        vendorProductIds.push(listing.masterProductId);
      }
    }

    const products = await Product.find({
      $or: [
        { _id: { $in: vendorProductIds } },
        { createdBy: vendorId }
      ],
      isDeleted: { $ne: true },
      $and: [
        {
          $or: [
            { name: regex },
            { brand: regex }
          ]
        }
      ]
    })
    .select("name brand images price category")
    .limit(6)
    .lean();

    // 2. Search Vendor's Orders (orderId, customer name, orderStatus)
    const orders = await CustomerOrder.find({
      vendorId,
      $or: [
        { orderId: regex },
        { "deliveryAddress.fullName": regex },
        { orderStatus: regex }
      ]
    })
    .select("orderId grandTotal orderStatus deliveryStatus createdAt deliveryAddress")
    .sort({ createdAt: -1 })
    .limit(6)
    .lean();

    res.status(200).json({
      success: true,
      products: products.map(p => ({
        ...p,
        stock: vpMap.get(p._id.toString()) || 0
      })),
      orders
    });
  } catch (error) {
    console.error("Vendor Search Error:", error);
    res.status(500).json({ success: false, message: "Search failed. Server Error" });
  }
};