import DeliveryBoy from "../models/DeliveryBoy.js";
import DeliveryBoyEarnings from "../models/DeliveryBoyEarnings.js";
import CustomerOrder from "../../customer/models/CustomerOrder.js";
import Vendor from "../../vendor/models/Vendor.js";
import User from "../../customer/models/User.js";
import { emitToRoom } from "../../socket/socketManager.js";
import RiderNotification from "../models/RiderNotification.js";
import PayoutSettings from "../models/PayoutSettings.js";
import RiderSupportTicket from "../models/RiderSupportTicket.js";
import mongoose from "mongoose";
import { handleOrderStatusChange, runInTransaction } from "../../utils/ledgerSyncHelper.js";
import { createVendorNotification } from "../../utils/notificationHelper.js";

// Helper to compute rider payout per order (defaulting to ONE flat payout per completed order)
const getCalculatedRiderPayout = (rider, settings, order) => {
  if (order?.riderPayout !== undefined && order?.riderPayout !== null) {
    return order.riderPayout;
  }
  const isOverride = rider?.payoutOverride && rider.payoutOverride.payoutType && rider.payoutOverride.payoutType !== "none";
  const payoutType = isOverride ? rider.payoutOverride.payoutType : (settings?.payoutType || "per_order");
  const baseFee = isOverride ? rider.payoutOverride.payoutAmount : (settings?.payoutAmount !== undefined ? settings.payoutAmount : 35);
  
  if (payoutType === "per_order") {
    return baseFee !== undefined ? baseFee : (order.deliveryCharge || 35);
  } else {
    return order.deliveryCharge || 35;
  }
};

const formatOrderWithPayout = (orderDoc, rider, settings) => {
  if (!orderDoc) return null;
  const obj = typeof orderDoc.toObject === "function" ? orderDoc.toObject() : { ...orderDoc };
  obj.riderPayout = getCalculatedRiderPayout(rider, settings, orderDoc);
  
  // Resolve primary vendor details for single or multi-vendor orders
  const primaryVendor = obj.vendorId || (obj.vendorSubOrders && obj.vendorSubOrders[0]?.vendorId);
  if (primaryVendor) {
    obj.primaryVendor = primaryVendor;
    if (!obj.vendorId) obj.vendorId = primaryVendor;
  }
  
  return obj;
};

const ensureMockAssignments = async (deliveryBoyId) => {
  return;
};

// Get Dashboard Data
export const getDashboard = async (req, res) => {
  try {
    const deliveryBoyId = req.deliveryBoy._id;
    await ensureMockAssignments(deliveryBoyId);

    // Fetch earnings
    let earnings = await DeliveryBoyEarnings.findOne({ deliveryBoy: deliveryBoyId });
    if (!earnings) {
      earnings = await DeliveryBoyEarnings.create({
        deliveryBoy: deliveryBoyId,
        totalEarnings: 0,
        incentives: 0,
        commissions: 0,
        walletBalance: 0,
        pendingBalance: 0,
        settledBalance: 0,
      });
    }

    // Fetch stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayOrders = await CustomerOrder.find({
      deliveryBoyId,
      deliveryStatus: "Delivered",
      updatedAt: { $gte: todayStart }
    });

    const todayEarningsCount = todayOrders.reduce((sum, order) => sum + (order.deliveryCharge || 0), 0);

    const pendingCount = await CustomerOrder.countDocuments({
      deliveryBoyId,
      deliveryStatus: "Assigned"
    });

    const inProgressCount = await CustomerOrder.countDocuments({
      deliveryBoyId,
      deliveryStatus: { $in: ["Picked_Up", "On_the_Way", "Reached_Customer"] }
    });

    const completedCount = await CustomerOrder.countDocuments({
      deliveryBoyId,
      deliveryStatus: "Delivered"
    });

    // Fetch active assignments (Pending or In Progress)
    const rider = await DeliveryBoy.findById(deliveryBoyId);
    const settings = await PayoutSettings.findOne() || {};

    const activeDeliveriesDocs = await CustomerOrder.find({
      deliveryBoyId,
      deliveryStatus: { $in: ["Assigned", "Picked_Up", "On_the_Way", "Reached_Customer"] }
    })
      .populate("vendorId", "shopName phone address latitude longitude")
      .populate("vendorSubOrders.vendorId", "shopName phone address latitude longitude")
      .sort({ createdAt: -1 });

    const activeDeliveries = activeDeliveriesDocs.map(o => formatOrderWithPayout(o, rider, settings));

    // Compute weekly earnings breakdown (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const weeklyOrders = await CustomerOrder.find({
      deliveryBoyId,
      deliveryStatus: "Delivered",
      updatedAt: { $gte: sevenDaysAgo }
    }).select("deliveryCharge riderPayout updatedAt");

    // Build day-keyed map
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      dayMap[key] = { day: dayNames[d.getDay()], amount: 0 };
    }

    weeklyOrders.forEach(order => {
      const key = new Date(order.updatedAt).toISOString().slice(0, 10);
      if (dayMap[key]) {
        dayMap[key].amount += getCalculatedRiderPayout(rider, settings, order);
      }
    });

    const weeklyBreakdown = Object.values(dayMap);

    res.status(200).json({
      success: true,
      stats: {
        todayEarnings: todayEarningsCount,
        completedDeliveries: completedCount,
        pendingOrders: pendingCount,
        inProgressOrders: inProgressCount,
      },
      earnings,
      activeDeliveries,
      weeklyBreakdown
    });
  } catch (error) {
    console.error("Get Delivery Boy Dashboard Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Assigned Orders
export const getOrders = async (req, res) => {
  try {
    const deliveryBoyId = req.deliveryBoy._id;
    const rider = await DeliveryBoy.findById(deliveryBoyId);
    const settings = await PayoutSettings.findOne() || {};
    const { tab } = req.query; // 'all', 'pending', 'progress', 'completed'

    let filter = { deliveryBoyId };

    if (tab === "pending") {
      filter.deliveryStatus = "Assigned";
    } else if (tab === "progress") {
      filter.deliveryStatus = { $in: ["Picked_Up", "On_the_Way", "Reached_Customer"] };
    } else if (tab === "completed") {
      filter.deliveryStatus = "Delivered";
    }

    const ordersDocs = await CustomerOrder.find(filter)
      .populate("vendorId", "shopName phone address latitude longitude")
      .populate("vendorSubOrders.vendorId", "shopName phone address latitude longitude")
      .sort({ createdAt: -1 });

    const orders = ordersDocs.map(o => formatOrderWithPayout(o, rider, settings));

    res.status(200).json({
      success: true,
      orders
    });
  } catch (error) {
    console.error("Get Assigned Orders Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Order Details
export const getOrderById = async (req, res) => {
  try {
    const rider = await DeliveryBoy.findById(req.deliveryBoy._id);
    const settings = await PayoutSettings.findOne() || {};

    const orderDoc = await CustomerOrder.findOne({
      _id: req.params.id,
      deliveryBoyId: req.deliveryBoy._id
    })
    .populate("vendorId", "shopName phone address latitude longitude")
    .populate("vendorSubOrders.vendorId", "shopName phone address latitude longitude")
    .populate("customerId", "fullName phoneNumber");

    if (!orderDoc) {
      return res.status(404).json({ success: false, message: "Order not found or not assigned to you" });
    }

    const order = formatOrderWithPayout(orderDoc, rider, settings);

    res.status(200).json({
      success: true,
      order
    });
  } catch (error) {
    console.error("Get Order Details Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Order Status (Sequential Transitions)
export const updateOrderStatus = async (req, res) => {
  try {
    const { status, latitude, longitude, note } = req.body;
    const order = await CustomerOrder.findOne({
      _id: req.params.id,
      deliveryBoyId: req.deliveryBoy._id
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order assignment not found" });
    }

    // Validate sequential state transitions
    const validTransitions = {
      "Assigned": "Picked_Up",
      "Picked_Up": "On_the_Way",
      "On_the_Way": "Reached_Customer"
    };

    if (validTransitions[order.deliveryStatus] !== status) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition from '${order.deliveryStatus}' to '${status}'`
      });
    }

    // Update status
    order.deliveryStatus = status;

    // Map deliveryStatus to CustomerOrder orderStatus for customer dashboard timeline visibility
    if (status === "Picked_Up") {
      order.orderStatus = "Packed";
    } else if (status === "On_the_Way") {
      order.orderStatus = "Out_for_Delivery";
    }

    // Log the event
    order.deliveryLogs.push({
      status,
      timestamp: new Date(),
      latitude: latitude || null,
      longitude: longitude || null,
      note: note || `Order updated to ${status.replace(/_/g, " ")}`
    });

    await order.save();

    // Map status to socket event name
    const eventMap = {
      Picked_Up: "order:pickedUp",
      On_the_Way: "order:onTheWay",
      Reached_Customer: "order:reachedCustomer",
    };
    const eventName = eventMap[status];
    if (eventName) {
      const payload = { orderId: order._id, orderId: order.orderId, status };
      // Notify customer
      if (order.customerId) emitToRoom(`customer:${order.customerId}`, eventName, payload);
      // Notify vendor
      if (order.vendorId) emitToRoom(`vendor:${order.vendorId}`, eventName, payload);
      // Notify admin dashboard
      emitToRoom("admin:global", eventName, payload);
    }

    const rider = await DeliveryBoy.findById(req.deliveryBoy._id);
    const settings = await PayoutSettings.findOne() || {};
    const formattedOrder = formatOrderWithPayout(order, rider, settings);

    res.status(200).json({
      success: true,
      message: `Status updated to ${status}`,
      order: formattedOrder
    });
  } catch (error) {
    console.error("Update Order Status Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Vendor Pickup Status (Multi-Vendor Checklist Action)
export const updateVendorPickupStatus = async (req, res) => {
  try {
    const { targetVendorId, status } = req.body; // status: "PICKED"
    const orderId = req.params.id;

    const order = await CustomerOrder.findOne({
      _id: orderId,
      deliveryBoyId: req.deliveryBoy._id
    })
      .populate("vendorId", "shopName phone address latitude longitude")
      .populate("vendorSubOrders.vendorId", "shopName phone address latitude longitude");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order assignment not found" });
    }

    const subOrder = (order.vendorSubOrders || []).find(
      (s) => (s.vendorId?._id || s.vendorId).toString() === targetVendorId
    );

    if (!subOrder) {
      return res.status(404).json({ success: false, message: "Target vendor sub-order not found" });
    }

    subOrder.pickupStatus = status || "PICKED";

    // Check if ALL active sub-orders (excluding rejected ones) are now PICKED
    const activeSubs = (order.vendorSubOrders || []).filter(s => s.subOrderStatus !== "Rejected" && s.subOrderStatus !== "Cancelled");
    const allPicked = activeSubs.every(s => s.pickupStatus === "PICKED");

    if (allPicked) {
      order.deliveryStatus = "Picked_Up";
      order.orderStatus = "Packed";
    }

    const vendorName = subOrder.vendorId?.shopName || "Vendor";
    order.deliveryLogs.push({
      status: allPicked ? "Picked_Up" : "Assigned",
      timestamp: new Date(),
      note: `Rider picked up items from ${vendorName} (${order.vendorSubOrders.filter(s => s.pickupStatus === "PICKED").length}/${order.vendorSubOrders.length} stores picked)`
    });

    await order.save();

    const rider = await DeliveryBoy.findById(req.deliveryBoy._id);
    const settings = await PayoutSettings.findOne() || {};
    const formattedOrder = formatOrderWithPayout(order, rider, settings);

    res.status(200).json({
      success: true,
      message: `Pickup marked for ${vendorName}`,
      order: formattedOrder,
      allPicked
    });
  } catch (error) {
    console.error("Update Vendor Pickup Status Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// OTP Verification (Complete Delivery)
export const verifyOtp = async (req, res) => {
  try {
    const { otp, latitude, longitude } = req.body;
    const orderId = req.params.id;
    let resultOrder = null;

    if (!otp) {
      return res.status(400).json({ success: false, message: "OTP code is required" });
    }

    await runInTransaction(async (session) => {
      const order = await CustomerOrder.findOne({
        _id: orderId,
        deliveryBoyId: req.deliveryBoy._id
      }).session(session);

      if (!order) {
        throw new Error("Order assignment not found");
      }

      if (order.deliveryOtp !== otp) {
        throw new Error("Invalid OTP code. Access denied.");
      }

      // Mark as completed
      order.deliveryStatus = "Delivered";
      order.orderStatus = "Delivered";
      order.paymentStatus = "Paid"; // COD orders are marked as Paid on delivery

      order.deliveryLogs.push({
        status: "Delivered",
        timestamp: new Date(),
        latitude: latitude || null,
        longitude: longitude || null,
        note: "Delivery successfully completed via customer OTP verification."
      });

      await order.save({ session });

      // Sync the ledger status to Delivered
      await handleOrderStatusChange(order._id, "Delivered", session);

      // Trigger 3: Create Order Delivered Notification for Vendor
      const targetVendorIds = order.vendorSubOrders?.map((vso) => vso.vendorId) || (order.primaryVendorId ? [order.primaryVendorId] : []);
      for (const vId of targetVendorIds) {
        await createVendorNotification({
          vendorId: vId,
          title: "Order Delivered 🎉",
          message: `Order #${order.orderId} has been delivered successfully.`,
          type: "ORDER_DELIVERED",
          relatedOrderId: order._id,
          session
        });
      }

      // Fetch dynamic default payout configurations
      let settings = await PayoutSettings.findOne().session(session);
      if (!settings) {
        settings = {
          payoutType: "per_order",
          payoutAmount: 35,
          incentiveAmount: 5,
          commissionAmount: 2,
          onTimeThresholdMinutes: 45
        };
      }

      const rider = await DeliveryBoy.findById(req.deliveryBoy._id).session(session);
      const isOverride = rider && rider.payoutOverride && rider.payoutOverride.payoutType !== "none";
      
      const payoutType = isOverride ? rider.payoutOverride.payoutType : settings.payoutType;
      const baseFee = isOverride ? rider.payoutOverride.payoutAmount : settings.payoutAmount;
      const incentiveVal = isOverride ? rider.payoutOverride.incentiveAmount : settings.incentiveAmount;
      const commissionVal = isOverride ? rider.payoutOverride.commissionAmount : settings.commissionAmount;
      const thresholdMinutes = isOverride ? rider.payoutOverride.onTimeThresholdMinutes : settings.onTimeThresholdMinutes;

      // On-time check based on Assigned timestamp logs
      let incentive = 0;
      const assignedLog = order.deliveryLogs.find(l => l.status === "Assigned");
      if (assignedLog) {
        const timeTakenMs = Date.now() - new Date(assignedLog.timestamp).getTime();
        if (timeTakenMs <= thresholdMinutes * 60 * 1000) {
          incentive = incentiveVal;
        }
      }

      // Base fee credited based on payoutType (per_order baseFee rate or order.deliveryCharge fallback)
      const fee = (payoutType === "per_order") ? (baseFee !== undefined ? baseFee : (order.deliveryCharge || 35)) : 0;
      order.riderPayout = fee;
      await order.save({ session });

      const commission = commissionVal;
      const credit = fee + incentive + commission;

      await DeliveryBoyEarnings.findOneAndUpdate(
        { deliveryBoy: req.deliveryBoy._id },
        {
          $inc: {
            totalEarnings: credit,
            incentives: incentive,
            commissions: commission,
            walletBalance: credit,
            settledBalance: credit
          }
        },
        { upsert: true, session }
      );
      resultOrder = order;
    });

    // Emit real-time "delivered" event to customer, vendor, and admin
    const deliveredPayload = { orderId: resultOrder._id, orderIdStr: resultOrder.orderId, status: "Delivered" };
    if (resultOrder.customerId) emitToRoom(`customer:${resultOrder.customerId}`, "order:delivered", deliveredPayload);
    if (resultOrder.vendorId) emitToRoom(`vendor:${resultOrder.vendorId}`, "order:delivered", deliveredPayload);
    emitToRoom("admin:global", "order:delivered", deliveredPayload);

    res.status(200).json({
      success: true,
      message: "Order delivered successfully!",
      order: resultOrder
    });
  } catch (error) {
    console.error("OTP Verification Error:", error);
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// Get Earnings Analytics
export const getEarnings = async (req, res) => {
  try {
    const deliveryBoyId = req.deliveryBoy._id;
    const earnings = await DeliveryBoyEarnings.findOne({ deliveryBoy: deliveryBoyId });

    // Fetch past completed orders to construct recent breakdown list
    const completedOrders = await CustomerOrder.find({
      deliveryBoyId,
      deliveryStatus: "Delivered"
    }).sort({ updatedAt: -1 }).limit(10);

    res.status(200).json({
      success: true,
      earnings: earnings || {
        totalEarnings: 0,
        incentives: 0,
        commissions: 0,
        walletBalance: 0,
        pendingBalance: 0,
        settledBalance: 0,
      },
      history: completedOrders
    });
  } catch (error) {
    console.error("Get Earnings Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Profile
export const updateProfile = async (req, res) => {
  try {
    const { fullName, vehicleType, vehicleNumber, latitude, longitude } = req.body;
    const deliveryBoy = await DeliveryBoy.findById(req.deliveryBoy._id);

    if (!deliveryBoy) {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }

    if (fullName) deliveryBoy.fullName = fullName;
    if (vehicleType) deliveryBoy.vehicleDetails.type = vehicleType;
    if (vehicleNumber) deliveryBoy.vehicleDetails.number = vehicleNumber;
    if (latitude) deliveryBoy.latitude = latitude;
    if (longitude) deliveryBoy.longitude = longitude;

    await deliveryBoy.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      deliveryBoy
    });
  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Onboarding Status & Progress
export const getOnboardingStatus = async (req, res) => {
  try {
    const rider = await DeliveryBoy.findById(req.deliveryBoy._id)
      .populate("assignedStoreId", "shopName address phone");
    if (!rider) {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }
    res.status(200).json({
      success: true,
      onboardingStatus: rider.onboardingStatus,
      vehicleTypeSelection: rider.vehicleTypeSelection,
      documents: rider.documents,
      bankDetails: rider.bankDetails,
      trainingChecklist: rider.trainingChecklist,
      agreement: rider.agreement,
      assignedStore: rider.assignedStoreId,
      fullName: rider.fullName,
      phone: rider.phone,
      email: rider.email,
      city: rider.city,
      preferredWorkingLocation: rider.preferredWorkingLocation,
      preferredShift: rider.preferredShift
    });
  } catch (error) {
    console.error("Get Onboarding Status Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Vehicle Type Selection
export const updateVehicleSelection = async (req, res) => {
  try {
    const { vehicleTypeSelection } = req.body;
    if (!["own_bike", "scooter", "e_rickshaw", "electric_vehicle", "bicycle"].includes(vehicleTypeSelection)) {
      return res.status(400).json({ success: false, message: "Invalid vehicle type" });
    }

    const rider = await DeliveryBoy.findById(req.deliveryBoy._id);
    rider.vehicleTypeSelection = vehicleTypeSelection;
    await rider.save();

    res.status(200).json({ success: true, message: "Vehicle type updated", rider });
  } catch (error) {
    console.error("Update Vehicle Selection Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Submit KYC and Bank Account Info
export const submitKycDetails = async (req, res) => {
  try {
    const { email, city, preferredWorkingLocation, preferredShift, bankDetails, documents } = req.body;
    const rider = await DeliveryBoy.findById(req.deliveryBoy._id);

    if (email) rider.email = email;
    if (city) rider.city = city;
    if (preferredWorkingLocation) {
      rider.preferredWorkingLocation = {
        address: preferredWorkingLocation.address || "",
        latitude: preferredWorkingLocation.latitude || 0,
        longitude: preferredWorkingLocation.longitude || 0
      };
    }
    if (preferredShift) rider.preferredShift = preferredShift;

    if (bankDetails) {
      rider.bankDetails = {
        accountNumber: bankDetails.accountNumber || "",
        ifscCode: bankDetails.ifscCode || "",
        accountHolderName: bankDetails.accountHolderName || "",
        passbookImage: bankDetails.passbookImage || ""
      };
    }

    if (documents && Array.isArray(documents)) {
      documents.forEach(doc => {
        const existingIdx = rider.documents.findIndex(d => d.docType === doc.docType);
        if (existingIdx > -1) {
          rider.documents[existingIdx].fileUrl = doc.fileUrl;
          rider.documents[existingIdx].fileType = doc.fileType || "image";
          rider.documents[existingIdx].verificationStatus = "pending";
          rider.documents[existingIdx].uploadedAt = new Date();
        } else {
          rider.documents.push({
            docType: doc.docType,
            fileUrl: doc.fileUrl,
            fileType: doc.fileType || "image",
            verificationStatus: "pending"
          });
        }
      });
    }

    // Set status to pending document review
    rider.onboardingStatus = "kyc_pending";
    await rider.save();

    // Trigger notification to admin dashboard (Socket.io)
    emitToRoom("admin:global", "documentUploaded", {
      riderId: rider._id,
      riderName: rider.fullName,
      message: `${rider.fullName} uploaded KYC documents.`
    });

    res.status(200).json({ success: true, message: "KYC details submitted successfully", rider });
  } catch (error) {
    console.error("Submit KYC Details Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Submit/Complete Training Videos Checklist
export const submitTrainingChecklist = async (req, res) => {
  try {
    const { moduleName } = req.body;
    const rider = await DeliveryBoy.findById(req.deliveryBoy._id);

    if (rider.onboardingStatus !== "training_pending") {
      return res.status(400).json({ success: false, message: "Rider is not in training stage" });
    }

    const idx = rider.trainingChecklist.findIndex(t => t.moduleName === moduleName);
    if (idx > -1) {
      rider.trainingChecklist[idx].completed = true;
      rider.trainingChecklist[idx].completedAt = new Date();
    } else {
      rider.trainingChecklist.push({
        moduleName,
        type: "video",
        completed: true,
        completedAt: new Date()
      });
    }

    // Check if all 6 standard modules are complete
    const requiredModules = [
      "Using the delivery app",
      "Order pickup process",
      "Customer interaction",
      "COD handling",
      "Safety guidelines",
      "Delivery timing expectations"
    ];
    const completedAllVideos = requiredModules.every(mod => 
      rider.trainingChecklist.some(t => t.moduleName === mod && t.completed)
    );

    if (completedAllVideos) {
      rider.onboardingStatus = "training_completed";
      emitToRoom(`deliveryBoy:${rider._id}`, "onboardingStatusChanged", { onboardingStatus: "training_completed" });
    }

    await rider.save();
    res.status(200).json({ success: true, message: `Module "${moduleName}" marked complete`, rider });
  } catch (error) {
    console.error("Submit Training Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Sign e-Agreement Contract
export const signAgreement = async (req, res) => {
  try {
    const { typedName, signed } = req.body;
    if (!signed || !typedName) {
      return res.status(400).json({ success: false, message: "Agreement must be checked and signed" });
    }

    const rider = await DeliveryBoy.findById(req.deliveryBoy._id);
    if (rider.onboardingStatus === "active") {
      return res.status(200).json({ success: true, message: "Agreement already signed. Account active.", rider });
    }
    if (rider.onboardingStatus !== "agreement_pending") {
      return res.status(400).json({ success: false, message: "Rider is not in agreement signing stage" });
    }

    const ipAddress = req.ip || req.headers["x-forwarded-for"] || "127.0.0.1";

    rider.agreement = {
      signed: true,
      signedAt: new Date(),
      ipAddress,
      typedName,
      agreementPdfUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf" // stub pdf URL
    };

    rider.onboardingStatus = "active";
    await rider.save();

    // Notify Rider and Admin
    emitToRoom(`deliveryBoy:${rider._id}`, "onboardingStatusChanged", { onboardingStatus: "active" });
    emitToRoom("admin:global", "onboardingCompleted", { riderId: rider._id, riderName: rider.fullName });

    // Send persistent notification to Rider
    await RiderNotification.create({
      deliveryBoyId: rider._id,
      title: "Account Activated! 🚀",
      message: "Congratulations! Your account is active. You can now toggle online and start accepting deliveries.",
      type: "onboarding"
    });

    res.status(200).json({ success: true, message: "Agreement signed. Account activated!", rider });
  } catch (error) {
    console.error("Sign Agreement Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Fetch Notifications List
export const getNotifications = async (req, res) => {
  try {
    const notifications = await RiderNotification.find({ deliveryBoyId: req.deliveryBoy._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.status(200).json({ success: true, notifications });
  } catch (error) {
    console.error("Get Notifications Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Mark Notification as Read
export const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await RiderNotification.findOneAndUpdate(
      { _id: id, deliveryBoyId: req.deliveryBoy._id },
      { read: true },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }
    res.status(200).json({ success: true, notification });
  } catch (error) {
    console.error("Mark Notification Read Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Toggle Availability Online/Offline
export const toggleOnlineStatus = async (req, res) => {
  try {
    const { isOnline } = req.body;
    const rider = await DeliveryBoy.findById(req.deliveryBoy._id);
    if (rider.onboardingStatus !== "active") {
      return res.status(400).json({ success: false, message: "Onboarding must be active to toggle status" });
    }

    rider.isOnline = !!isOnline;
    await rider.save();

    res.status(200).json({ success: true, message: `Rider is now ${isOnline ? "online" : "offline"}`, rider });
  } catch (error) {
    console.error("Toggle Online Status Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Submit Rider Support Ticket
export const submitSupportTicket = async (req, res) => {
  try {
    const { category, description } = req.body;
    if (!category || !description) {
      return res.status(400).json({ success: false, message: "Category and description are required" });
    }

    const ticket = await RiderSupportTicket.create({
      deliveryBoyId: req.deliveryBoy._id,
      category,
      description,
      status: "Open"
    });

    res.status(201).json({
      success: true,
      message: "Support ticket submitted successfully",
      ticket
    });
  } catch (error) {
    console.error("Submit Support Ticket Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Haversine Distance Calculation (in kilometers)
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Solve TSP using Nearest Neighbor + 2-Opt Iterative Refinement
const solveTSP = (origin, nodes) => {
  if (!nodes || nodes.length === 0) return [];
  if (nodes.length === 1) {
    const dist = haversineDistance(origin.lat, origin.lng, nodes[0].lat, nodes[0].lng);
    const roundedDist = Math.round(dist * 100) / 100;
    return [{
      ...nodes[0],
      step: 1,
      distanceFromPrev: roundedDist,
      cumulativeDistance: roundedDist,
      estimatedMinutes: Math.ceil((dist / 20) * 60) + 3
    }];
  }

  // 1. Nearest Neighbor construction starting from origin
  const unvisited = [...nodes];
  let currentPos = { lat: origin.lat, lng: origin.lng };
  const route = [];

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let minD = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const d = haversineDistance(currentPos.lat, currentPos.lng, unvisited[i].lat, unvisited[i].lng);
      if (d < minD) {
        minD = d;
        nearestIdx = i;
      }
    }

    const nextNode = unvisited.splice(nearestIdx, 1)[0];
    route.push(nextNode);
    currentPos = { lat: nextNode.lat, lng: nextNode.lng };
  }

  // 2. 2-Opt Refinement
  let improved = true;
  let passes = 0;
  while (improved && passes < 100) {
    improved = false;
    passes++;
    for (let i = 0; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const prev1 = i === 0 ? origin : route[i - 1];
        const node1 = route[i];
        const node2 = route[k];
        const next2 = k === route.length - 1 ? null : route[k + 1];

        const currentDist = haversineDistance(prev1.lat, prev1.lng, node1.lat, node1.lng) +
          (next2 ? haversineDistance(node2.lat, node2.lng, next2.lat, next2.lng) : 0);
        
        const newDist = haversineDistance(prev1.lat, prev1.lng, node2.lat, node2.lng) +
          (next2 ? haversineDistance(node1.lat, node1.lng, next2.lat, next2.lng) : 0);

        if (newDist < currentDist - 0.001) {
          const sub = route.slice(i, k + 1).reverse();
          route.splice(i, k - i + 1, ...sub);
          improved = true;
        }
      }
    }
  }

  // 3. Annotate steps, distance, and ETAs
  let cumulative = 0;
  let prev = origin;

  return route.map((item, idx) => {
    const d = haversineDistance(prev.lat, prev.lng, item.lat, item.lng);
    cumulative += d;
    prev = item;

    const roundedDist = Math.round(d * 100) / 100;
    const roundedCumulative = Math.round(cumulative * 100) / 100;
    const estMins = Math.ceil((d / 20) * 60) + 3;

    return {
      ...item,
      step: idx + 1,
      distanceFromPrev: roundedDist,
      cumulativeDistance: roundedCumulative,
      estimatedMinutes: estMins
    };
  });
};

// Route Optimization Endpoint (TSP Algorithm)
export const getOptimizedRoute = async (req, res) => {
  try {
    const deliveryBoyId = req.deliveryBoy._id;
    const rider = await DeliveryBoy.findById(deliveryBoyId);

    const { lat: reqLat, lng: reqLng } = req.query;

    // Fetch active assigned orders for this rider (handles strings, ObjectIds, and any active delivery state)
    const activeOrders = await CustomerOrder.find({
      $or: [{ deliveryBoyId }, { deliveryBoyId: deliveryBoyId.toString() }],
      deliveryStatus: { $ne: "Delivered" },
      orderStatus: { $nin: ["Cancelled", "Rejected"] }
    })
      .populate("vendorId", "shopName phone address latitude longitude")
      .populate("vendorSubOrders.vendorId", "shopName phone address latitude longitude")
      .populate("customerId", "fullName phoneNumber")
      .sort({ createdAt: -1 });

    if (activeOrders.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No active assigned orders to optimize.",
        totalOrders: 0,
        totalDistanceKm: 0,
        totalEstimatedMinutes: 0,
        optimizedSequence: []
      });
    }

    // Determine rider origin point
    let originLat = Number(reqLat) || rider?.location?.latitude;
    let originLng = Number(reqLng) || rider?.location?.longitude;

    if (!originLat || !originLng) {
      const primaryVendor = activeOrders[0]?.vendorId || activeOrders[0]?.vendorSubOrders?.[0]?.vendorId;
      originLat = primaryVendor?.latitude || 28.6139;
      originLng = primaryVendor?.longitude || 77.2090;
    }

    const origin = { lat: originLat, lng: originLng };

    // Format drop points from active orders with real customer drop addresses
    const nodes = activeOrders.map((order, index) => {
      const addr = order.deliveryAddress || {};
      const fullAddressStr = `${addr.houseNo || ""}, ${addr.area || ""}, ${addr.city || ""}, ${addr.state || ""} - ${addr.pincode || ""}`.replace(/^[\s,]+|[\s,]+$/g, "");
      
      // Resolve drop coordinates: use exact coords if available, or generate deterministic radius offsets per order
      let nodeLat = addr.latitude;
      let nodeLng = addr.longitude;

      if (!nodeLat || !nodeLng) {
        // Derive unique location coordinates within ~4km radius based on orderId hash
        const hash = order.orderId ? order.orderId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) : index;
        const angle = (hash * 137.5 * Math.PI) / 180;
        const radiusKm = 0.5 + ((hash % 35) / 10); // 0.5km to 4.0km radius
        nodeLat = originLat + (radiusKm / 111) * Math.cos(angle);
        nodeLng = originLng + (radiusKm / (111 * Math.cos((originLat * Math.PI) / 180))) * Math.sin(angle);
      }

      const shopName = order.vendorId?.shopName || order.vendorSubOrders?.[0]?.vendorId?.shopName || "Aryusha Partner Store";

      return {
        orderDbId: order._id,
        orderId: order.orderId,
        customerName: addr.fullName || order.customerId?.fullName || "Customer",
        customerPhone: addr.phoneNumber || order.customerId?.phoneNumber || "N/A",
        address: fullAddressStr || "Customer Delivery Location",
        area: addr.area || addr.city || "",
        deliveryStatus: order.deliveryStatus,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        grandTotal: order.grandTotal,
        storeName: shopName,
        lat: nodeLat,
        lng: nodeLng
      };
    });

    // Run TSP Solver
    const optimizedSequence = solveTSP(origin, nodes);
    const totalDistanceKm = optimizedSequence.length > 0 ? optimizedSequence[optimizedSequence.length - 1].cumulativeDistance : 0;
    const totalEstimatedMinutes = optimizedSequence.reduce((sum, item) => sum + item.estimatedMinutes, 0);

    res.status(200).json({
      success: true,
      totalOrders: optimizedSequence.length,
      totalDistanceKm,
      totalEstimatedMinutes,
      startPoint: {
        lat: originLat,
        lng: originLng,
        label: "Rider Current Location"
      },
      optimizedSequence
    });
  } catch (error) {
    console.error("Get Optimized Route Error:", error);
    res.status(500).json({ success: false, message: "Server Error during route optimization" });
  }
};
