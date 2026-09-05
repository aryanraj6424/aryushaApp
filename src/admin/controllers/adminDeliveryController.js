import mongoose from "mongoose";
import CustomerOrder from "../../customer/models/CustomerOrder.js";
import DeliveryBoy from "../../deliveryBoy/models/DeliveryBoy.js";
import DeliveryBoyEarnings from "../../deliveryBoy/models/DeliveryBoyEarnings.js";
import PayoutSettings from "../../deliveryBoy/models/PayoutSettings.js";
import RiderNotification from "../../deliveryBoy/models/RiderNotification.js";
import Vendor from "../../vendor/models/Vendor.js";
import DeliverySlot from "../../customer/models/DeliverySlot.js";
import { emitToRoom } from "../../socket/socketManager.js";

// Helper: Convert array of objects to CSV string
const convertToCSV = (data, fields) => {
  const header = fields.join(",") + "\n";
  const rows = data.map(row => {
    return fields.map(field => {
      let val = field.split('.').reduce((obj, key) => (obj && obj[key] !== 'undefined') ? obj[key] : '', row);
      if (val instanceof Date) val = val.toISOString();
      if (typeof val === 'string') val = `"${val.replace(/"/g, '""')}"`;
      return val;
    }).join(",");
  }).join("\n");
  return header + rows;
};

// 1. GET /admin/deliveries (list with filters)
export const getDeliveries = async (req, res) => {
  try {
    const { status, vendor, deliveryBoy, startDate, endDate, page = 1, limit = 10 } = req.query;
    const query = { deliveryStatus: { $ne: "None" } };

    if (status) query.deliveryStatus = status;
    if (vendor) query.vendorId = vendor;
    if (deliveryBoy) query.deliveryBoyId = deliveryBoy;
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skipCount = (Number(page) - 1) * Number(limit);

    const deliveries = await CustomerOrder.find(query)
      .populate("vendorId", "shopName")
      .populate("customerId", "fullName")
      .populate("deliveryBoyId", "fullName phone")
      .sort({ updatedAt: -1 })
      .skip(skipCount)
      .limit(Number(limit));

    const totalCount = await CustomerOrder.countDocuments(query);
    const totalPages = Math.ceil(totalCount / Number(limit));

    res.status(200).json({
      success: true,
      deliveries,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        totalCount,
        totalPages
      }
    });
  } catch (error) {
    console.error("Get Deliveries Admin Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 2. GET /admin/deliveries/:orderId (full delivery timeline)
export const getDeliveryById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await CustomerOrder.findById(orderId)
      .populate("vendorId", "shopName phone address")
      .populate("customerId", "fullName email phoneNumber")
      .populate("deliveryBoyId", "fullName phone vehicleDetails status accountStatus");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    res.status(200).json({
      success: true,
      order
    });
  } catch (error) {
    console.error("Get Delivery By ID Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 3. GET /admin/delivery-logs (filterable audit log)
export const getDeliveryLogs = async (req, res) => {
  try {
    const { vendor, deliveryBoy, orderId, eventType, startDate, endDate, page = 1, limit = 20 } = req.query;
    
    const match = { deliveryStatus: { $ne: "None" } };
    if (vendor) match.vendorId = new mongoose.Types.ObjectId(vendor);
    if (deliveryBoy) match.deliveryBoyId = new mongoose.Types.ObjectId(deliveryBoy);
    if (orderId) match.orderId = orderId;

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    const pipeline = [
      { $match: match },
      { $unwind: "$deliveryLogs" },
      {
        $project: {
          _id: 1,
          orderId: 1,
          vendorId: 1,
          deliveryBoyId: 1,
          log: "$deliveryLogs"
        }
      }
    ];

    // Filter by Event Type
    if (eventType) {
      if (eventType === "status_change") {
        pipeline.push({ $match: { "log.status": { $ne: "None" } } });
      } else if (eventType === "otp_verified") {
        pipeline.push({ $match: { "log.note": /verified|confirmed/i } });
      } else if (eventType === "otp_failed") {
        pipeline.push({ $match: { "log.note": /failed|invalid/i } });
      }
    }

    pipeline.push({ $sort: { "log.timestamp": -1 } });

    // For total count
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await CustomerOrder.aggregate(countPipeline);
    const totalCount = countResult[0]?.total || 0;

    // Apply pagination
    const skipCount = (Number(page) - 1) * Number(limit);
    pipeline.push({ $skip: skipCount }, { $limit: Number(limit) });

    // Populate references in aggregation
    pipeline.push(
      {
        $lookup: {
          from: "vendors",
          localField: "vendorId",
          foreignField: "_id",
          as: "vendor"
        }
      },
      {
        $lookup: {
          from: "deliveryboys",
          localField: "deliveryBoyId",
          foreignField: "_id",
          as: "rider"
        }
      },
      {
        $project: {
          orderId: 1,
          vendorName: { $arrayElemAt: ["$vendor.shopName", 0] },
          riderName: { $arrayElemAt: ["$rider.fullName", 0] },
          status: "$log.status",
          timestamp: "$log.timestamp",
          note: "$log.note"
        }
      }
    );

    const logs = await CustomerOrder.aggregate(pipeline);

    res.status(200).json({
      success: true,
      logs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        totalCount,
        totalPages: Math.ceil(totalCount / Number(limit))
      }
    });
  } catch (error) {
    console.error("Get Delivery Logs Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 4. GET /admin/delivery-logs/export (CSV export)
export const exportDeliveryLogs = async (req, res) => {
  try {
    const { vendor, deliveryBoy, orderId, eventType, startDate, endDate } = req.query;

    const match = { deliveryStatus: { $ne: "None" } };
    if (vendor) match.vendorId = new mongoose.Types.ObjectId(vendor);
    if (deliveryBoy) match.deliveryBoyId = new mongoose.Types.ObjectId(deliveryBoy);
    if (orderId) match.orderId = orderId;

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    const pipeline = [
      { $match: match },
      { $unwind: "$deliveryLogs" },
      {
        $project: {
          _id: 1,
          orderId: 1,
          vendorId: 1,
          deliveryBoyId: 1,
          log: "$deliveryLogs"
        }
      }
    ];

    if (eventType) {
      if (eventType === "status_change") {
        pipeline.push({ $match: { "log.status": { $ne: "None" } } });
      } else if (eventType === "otp_verified") {
        pipeline.push({ $match: { "log.note": /verified|confirmed/i } });
      } else if (eventType === "otp_failed") {
        pipeline.push({ $match: { "log.note": /failed/i } });
      }
    }

    pipeline.push(
      { $sort: { "log.timestamp": -1 } },
      {
        $lookup: {
          from: "vendors",
          localField: "vendorId",
          foreignField: "_id",
          as: "vendor"
        }
      },
      {
        $lookup: {
          from: "deliveryboys",
          localField: "deliveryBoyId",
          foreignField: "_id",
          as: "rider"
        }
      },
      {
        $project: {
          orderId: 1,
          vendorName: { $arrayElemAt: ["$vendor.shopName", 0] },
          riderName: { $arrayElemAt: ["$rider.fullName", 0] },
          status: "$log.status",
          timestamp: "$log.timestamp",
          note: "$log.note"
        }
      }
    );

    const logs = await CustomerOrder.aggregate(pipeline);
    const fields = ["orderId", "vendorName", "riderName", "status", "timestamp", "note"];
    const csv = convertToCSV(logs, fields);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="delivery-logs.csv"');
    res.status(200).send(csv);
  } catch (error) {
    console.error("Export Logs Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 5. GET /admin/reports/deliveries (aggregated reports)
export const getDeliveryReports = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateQuery = { deliveryStatus: { $ne: "None" } };

    if (startDate || endDate) {
      dateQuery.createdAt = {};
      if (startDate) dateQuery.createdAt.$gte = new Date(startDate);
      if (endDate) dateQuery.createdAt.$lte = new Date(endDate);
    }

    // A. Performance Leaderboard & Payout totals
    const leaderboardPipeline = [
      { $match: dateQuery },
      {
        $group: {
          _id: "$deliveryBoyId",
          totalOrders: { $sum: 1 },
          completedOrders: {
            $sum: { $cond: [{ $eq: ["$deliveryStatus", "Delivered"] }, 1, 0] }
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ["$orderStatus", "Cancelled"] }, 1, 0] }
          },
          totalEarnings: { $sum: "$deliveryCharge" }
        }
      },
      {
        $lookup: {
          from: "deliveryboys",
          localField: "_id",
          foreignField: "_id",
          as: "rider"
        }
      },
      {
        $project: {
          riderName: { $arrayElemAt: ["$rider.fullName", 0] },
          phone: { $arrayElemAt: ["$rider.phone", 0] },
          totalOrders: 1,
          completedOrders: 1,
          cancelledOrders: 1,
          totalEarnings: 1
        }
      },
      { $sort: { completedOrders: -1 } }
    ];

    const leaderboard = await CustomerOrder.aggregate(leaderboardPipeline);

    // B. Vendorwise volume
    const vendorVolumePipeline = [
      { $match: dateQuery },
      {
        $group: {
          _id: "$vendorId",
          orderCount: { $sum: 1 },
          deliveredCount: {
            $sum: { $cond: [{ $eq: ["$deliveryStatus", "Delivered"] }, 1, 0] }
          }
        }
      },
      {
        $lookup: {
          from: "vendors",
          localField: "_id",
          foreignField: "_id",
          as: "vendor"
        }
      },
      {
        $project: {
          shopName: { $arrayElemAt: ["$vendor.shopName", 0] },
          orderCount: 1,
          deliveredCount: 1
        }
      },
      { $sort: { orderCount: -1 } }
    ];

    const vendorVolume = await CustomerOrder.aggregate(vendorVolumePipeline);

    // C. General Performance metrics: On-time vs Delayed (Threshold: 45 minutes = 2700000 ms)
    const orders = await CustomerOrder.find(dateQuery).select("deliveryLogs deliveryStatus");
    let totalCompleted = 0;
    let onTimeCount = 0;
    let delayedCount = 0;

    orders.forEach(order => {
      if (order.deliveryStatus === "Delivered") {
        totalCompleted++;
        const assignedLog = order.deliveryLogs.find(l => l.status === "Assigned");
        const deliveredLog = order.deliveryLogs.find(l => l.status === "Delivered");
        
        if (assignedLog && deliveredLog) {
          const duration = new Date(deliveredLog.timestamp) - new Date(assignedLog.timestamp);
          if (duration <= 45 * 60 * 1000) {
            onTimeCount++;
          } else {
            delayedCount++;
          }
        } else {
          onTimeCount++; // Default fallback
        }
      }
    });

    const onTimeRate = totalCompleted > 0 ? Math.round((onTimeCount / totalCompleted) * 100) : 100;

    res.status(200).json({
      success: true,
      leaderboard,
      vendorVolume,
      metrics: {
        totalCompleted,
        onTimeCount,
        delayedCount,
        onTimeRate
      }
    });
  } catch (error) {
    console.error("Get Delivery Reports Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 6. GET /admin/reports/deliveries/export
export const exportDeliveryReports = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateQuery = { deliveryStatus: { $ne: "None" } };

    if (startDate || endDate) {
      dateQuery.createdAt = {};
      if (startDate) dateQuery.createdAt.$gte = new Date(startDate);
      if (endDate) dateQuery.createdAt.$lte = new Date(endDate);
    }

    const leaderboardPipeline = [
      { $match: dateQuery },
      {
        $group: {
          _id: "$deliveryBoyId",
          totalOrders: { $sum: 1 },
          completedOrders: {
            $sum: { $cond: [{ $eq: ["$deliveryStatus", "Delivered"] }, 1, 0] }
          },
          totalEarnings: { $sum: "$deliveryCharge" }
        }
      },
      {
        $lookup: {
          from: "deliveryboys",
          localField: "_id",
          foreignField: "_id",
          as: "rider"
        }
      },
      {
        $project: {
          riderName: { $arrayElemAt: ["$rider.fullName", 0] },
          phone: { $arrayElemAt: ["$rider.phone", 0] },
          totalOrders: 1,
          completedOrders: 1,
          totalEarnings: 1
        }
      },
      { $sort: { completedOrders: -1 } }
    ];

    const report = await CustomerOrder.aggregate(leaderboardPipeline);
    const fields = ["riderName", "phone", "totalOrders", "completedOrders", "totalEarnings"];
    const csv = convertToCSV(report, fields);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="delivery-boy-performance-report.csv"');
    res.status(200).send(csv);
  } catch (error) {
    console.error("Export Reports Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 7. GET /admin/delivery-boys (list with performance summary)
export const getDeliveryBoys = async (req, res) => {
  try {
    const riders = await DeliveryBoy.find({ status: "approved" }).sort({ createdAt: -1 });

    const ridersWithStats = await Promise.all(
      riders.map(async (rider) => {
        const completedCount = await CustomerOrder.countDocuments({
          deliveryBoyId: rider._id,
          deliveryStatus: "Delivered"
        });

        const activeCount = await CustomerOrder.countDocuments({
          deliveryBoyId: rider._id,
          deliveryStatus: { $in: ["Assigned", "Picked_Up", "On_the_Way", "Reached_Customer"] }
        });

        const earningsDoc = await DeliveryBoyEarnings.findOne({ deliveryBoyId: rider._id });

        return {
          _id: rider._id,
          fullName: rider.fullName,
          phone: rider.phone,
          vehicleDetails: rider.vehicleDetails,
          accountStatus: rider.accountStatus,
          status: rider.status,
          completedDeliveries: completedCount,
          activeDeliveries: activeCount,
          walletBalance: earningsDoc?.walletBalance || 0
        };
      })
    );

    res.status(200).json({
      success: true,
      riders: ridersWithStats
    });
  } catch (error) {
    console.error("Get Admin Delivery Boys Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 8. GET /admin/delivery-boys/:id (profile + history)
export const getDeliveryBoyById = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await DeliveryBoy.findById(id);
    
    if (!rider) {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }

    const earnings = await DeliveryBoyEarnings.findOne({ deliveryBoyId: id }) || { walletBalance: 0, totalEarnings: 0 };

    const history = await CustomerOrder.find({ deliveryBoyId: id })
      .populate("vendorId", "shopName")
      .populate("customerId", "fullName")
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      rider,
      earnings,
      history
    });
  } catch (error) {
    console.error("Get Rider Detail Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 9. PUT /admin/delivery-boys/:id/status (activate/suspend)
export const updateDeliveryBoyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { accountStatus } = req.body; // 'active' or 'suspended'

    if (!["active", "suspended"].includes(accountStatus)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const rider = await DeliveryBoy.findByIdAndUpdate(
      id,
      { accountStatus },
      { new: true }
    );

    if (!rider) {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }

    res.status(200).json({
      success: true,
      message: `Rider account has been ${accountStatus === "active" ? "activated" : "suspended"} successfully.`,
      rider
    });
  } catch (error) {
    console.error("Update Rider Status Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// GET /admin/delivery-boys/onboarding (onboarding grid request lists)
export const getOnboardingRequests = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;
    const query = { onboardingStatus: { $ne: "active" } };

    if (status) {
      query.onboardingStatus = status;
    }

    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } }
      ];
    }

    const skipCount = (Number(page) - 1) * Number(limit);
    const riders = await DeliveryBoy.find(query)
      .sort({ createdAt: -1 })
      .skip(skipCount)
      .limit(Number(limit));

    const totalCount = await DeliveryBoy.countDocuments(query);

    res.status(200).json({
      success: true,
      riders,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        totalCount,
        totalPages: Math.ceil(totalCount / Number(limit))
      }
    });
  } catch (error) {
    console.error("Get Onboarding Requests Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// GET /admin/delivery-boys/:id/onboarding (detailed checklist status)
export const getOnboardingDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await DeliveryBoy.findById(id)
      .populate("assignedStoreId", "shopName address phone");

    if (!rider) {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }

    res.status(200).json({ success: true, rider });
  } catch (error) {
    console.error("Get Onboarding Detail Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// PUT /admin/delivery-boys/:id/verify-document (approve/reject single doc)
export const verifyRiderDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { docType, verificationStatus, rejectionReason } = req.body;

    if (!docType || !["verified", "rejected"].includes(verificationStatus)) {
      return res.status(400).json({ success: false, message: "Invalid verification status or document type" });
    }

    const rider = await DeliveryBoy.findById(id);
    if (!rider) {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }

    const docIndex = rider.documents.findIndex(d => d.docType === docType);
    if (docIndex === -1) {
      return res.status(404).json({ success: false, message: "Document not found on rider profile" });
    }

    rider.documents[docIndex].verificationStatus = verificationStatus;
    rider.documents[docIndex].verifiedBy = req.user?._id || null;
    rider.documents[docIndex].verifiedAt = new Date();
    if (verificationStatus === "rejected") {
      rider.documents[docIndex].rejectionReason = rejectionReason || "Document content not clear";
    } else {
      rider.documents[docIndex].rejectionReason = "";
    }

    // KYC transition verification check logic
    const mandatoryDocsMap = {
      bicycle: ["aadhaar", "pan", "photo", "selfie"],
      own_bike: ["aadhaar", "pan", "driving_license", "vehicle_rc", "insurance", "photo", "selfie"],
      scooter: ["aadhaar", "pan", "driving_license", "vehicle_rc", "insurance", "photo", "selfie"],
      e_rickshaw: ["aadhaar", "pan", "driving_license", "vehicle_rc", "insurance", "photo", "selfie"],
      electric_vehicle: ["aadhaar", "pan", "driving_license", "vehicle_rc", "insurance", "photo", "selfie"]
    };

    const typeKey = rider.vehicleTypeSelection || "own_bike";
    const requiredList = mandatoryDocsMap[typeKey] || mandatoryDocsMap["own_bike"];

    const allVerified = requiredList.every(type => 
      rider.documents.some(d => d.docType === type && d.verificationStatus === "verified")
    );

    const oldStatus = rider.onboardingStatus;
    if (allVerified && rider.onboardingStatus === "kyc_pending") {
      rider.onboardingStatus = "kyc_verified";
    } else if (!allVerified && rider.onboardingStatus === "kyc_verified") {
      rider.onboardingStatus = "kyc_pending";
    }

    // Auto seed training checklist if status advances to training_pending
    if (rider.onboardingStatus === "kyc_verified") {
      rider.onboardingStatus = "training_pending";
      const requiredModules = [
        "Using the delivery app",
        "Order pickup process",
        "Customer interaction",
        "COD handling",
        "Safety guidelines",
        "Delivery timing expectations"
      ];
      rider.trainingChecklist = requiredModules.map(moduleName => ({
        moduleName,
        type: moduleName === "Customer interaction" ? "in_person" : "video",
        completed: false
      }));
    }

    await rider.save();

    // Emit Socket notification to rider
    emitToRoom(`deliveryBoy:${rider._id}`, "documentStatusChanged", {
      docType,
      verificationStatus,
      rejectionReason: rider.documents[docIndex].rejectionReason,
      onboardingStatus: rider.onboardingStatus
    });

    if (rider.onboardingStatus !== oldStatus) {
      emitToRoom(`deliveryBoy:${rider._id}`, "onboardingStatusChanged", { onboardingStatus: rider.onboardingStatus });
    }

    // Persistent notifications
    await RiderNotification.create({
      deliveryBoyId: rider._id,
      title: verificationStatus === "verified" ? "Document Approved! ✅" : "Document Rejected! ❌",
      message: verificationStatus === "verified"
        ? `Your ${docType.replace(/_/g, " ").toUpperCase()} document has been verified successfully.`
        : `Your ${docType.replace(/_/g, " ").toUpperCase()} document was rejected. Reason: ${rejectionReason || "Please re-upload a clear file."}`,
      type: "onboarding"
    });

    res.status(200).json({ success: true, message: "Document status updated", rider });
  } catch (error) {
    console.error("Verify Rider Document Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// PUT /admin/delivery-boys/:id/training (mark in-person/checklist completion)
export const verifyRiderTraining = async (req, res) => {
  try {
    const { id } = req.params;
    const { moduleName, completed } = req.body;

    const rider = await DeliveryBoy.findById(id);
    if (!rider) {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }

    const idx = rider.trainingChecklist.findIndex(t => t.moduleName === moduleName);
    if (idx > -1) {
      rider.trainingChecklist[idx].completed = !!completed;
      rider.trainingChecklist[idx].completedAt = completed ? new Date() : null;
    } else {
      rider.trainingChecklist.push({
        moduleName,
        type: "in_person",
        completed: !!completed,
        completedAt: completed ? new Date() : null
      });
    }

    const requiredModules = [
      "Using the delivery app",
      "Order pickup process",
      "Customer interaction",
      "COD handling",
      "Safety guidelines",
      "Delivery timing expectations"
    ];
    const completedAll = requiredModules.every(mod => 
      rider.trainingChecklist.some(t => t.moduleName === mod && t.completed)
    );

    const oldStatus = rider.onboardingStatus;
    if (completedAll && rider.onboardingStatus === "training_pending") {
      rider.onboardingStatus = "training_completed";
    } else if (!completedAll && rider.onboardingStatus === "training_completed") {
      rider.onboardingStatus = "training_pending";
    }

    await rider.save();

    if (rider.onboardingStatus !== oldStatus) {
      emitToRoom(`deliveryBoy:${rider._id}`, "onboardingStatusChanged", { onboardingStatus: rider.onboardingStatus });
    }

    res.status(200).json({ success: true, message: "Training checklist status updated", rider });
  } catch (error) {
    console.error("Verify Rider Training Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// GET /admin/delivery-boys/:id/store-recommendations (haversine dark stores recommendation list)
export const getStoreRecommendations = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await DeliveryBoy.findById(id);
    if (!rider) {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }

    const stores = await Vendor.find({ status: "approved" }).select("shopName address latitude longitude phone");
    const riderLat = rider.preferredWorkingLocation?.latitude || rider.latitude || 28.6139;
    const riderLng = rider.preferredWorkingLocation?.longitude || rider.longitude || 77.2090;

    const computeDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371; // km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };

    const recommendations = await Promise.all(
      stores.map(async (store) => {
        const dist = computeDistance(riderLat, riderLng, store.latitude, store.longitude);
        const orderCount = await CustomerOrder.countDocuments({
          vendorId: store._id,
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        });
        return {
          ...store.toObject(),
          distanceKm: parseFloat(dist.toFixed(2)),
          demandIndex: orderCount > 10 ? "High" : orderCount > 3 ? "Medium" : "Low",
          recentOrders: orderCount
        };
      })
    );

    recommendations.sort((a, b) => a.distanceKm - b.distanceKm);
    res.status(200).json({ success: true, recommendations });
  } catch (error) {
    console.error("Get Store Recommendations Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// PUT /admin/delivery-boys/:id/assign-store (admin link store)
export const assignRiderStore = async (req, res) => {
  try {
    const { id } = req.params;
    const { storeId } = req.body;

    const rider = await DeliveryBoy.findById(id);
    if (!rider) {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }

    const store = await Vendor.findById(storeId);
    if (!store) {
      return res.status(404).json({ success: false, message: "Store not found" });
    }

    rider.assignedStoreId = storeId;
    if (rider.onboardingStatus === "training_completed" || rider.onboardingStatus === "training_pending") {
      rider.onboardingStatus = "agreement_pending";
    }

    await rider.save();

    // Trigger Notification
    emitToRoom(`deliveryBoy:${rider._id}`, "onboardingStatusChanged", { onboardingStatus: "agreement_pending" });
    
    await RiderNotification.create({
      deliveryBoyId: rider._id,
      title: "Store Assigned! 🏪",
      message: `You have been assigned to dark store: ${store.shopName}. Please sign your agreement.`,
      type: "assignment"
    });

    res.status(200).json({ success: true, message: "Store assigned successfully. Pending agreement e-sign.", rider });
  } catch (error) {
    console.error("Assign Rider Store Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// GET /admin/payout-settings (retrieve defaults)
export const getPayoutSettings = async (req, res) => {
  try {
    let settings = await PayoutSettings.findOne();
    if (!settings) {
      settings = await PayoutSettings.create({
        payoutType: "per_order",
        payoutAmount: 35,
        incentiveAmount: 5,
        commissionAmount: 2,
        onTimeThresholdMinutes: 45
      });
    }
    res.status(200).json({ success: true, settings });
  } catch (error) {
    console.error("Get Payout Settings Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// PUT /admin/payout-settings (update defaults)
export const updatePayoutSettings = async (req, res) => {
  try {
    const { payoutType, payoutAmount, incentiveAmount, commissionAmount, onTimeThresholdMinutes } = req.body;
    let settings = await PayoutSettings.findOne();
    if (!settings) {
      settings = new PayoutSettings();
    }

    if (payoutType) settings.payoutType = payoutType;
    if (payoutAmount !== undefined) settings.payoutAmount = payoutAmount;
    if (incentiveAmount !== undefined) settings.incentiveAmount = incentiveAmount;
    if (commissionAmount !== undefined) settings.commissionAmount = commissionAmount;
    if (onTimeThresholdMinutes !== undefined) settings.onTimeThresholdMinutes = onTimeThresholdMinutes;

    await settings.save();
    emitToRoom("admin:global", "payout:updated", { settings });
    res.status(200).json({ success: true, message: "Payout settings updated successfully", settings });
  } catch (error) {
    console.error("Update Payout Settings Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// PUT /admin/delivery-boys/:id/payout-override (rider custom override payout settings)
export const updateRiderPayoutOverride = async (req, res) => {
  try {
    const { id } = req.params;
    const { payoutType, payoutAmount, incentiveAmount, commissionAmount, onTimeThresholdMinutes } = req.body;

    const rider = await DeliveryBoy.findById(id);
    if (!rider) {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }

    rider.payoutOverride = {
      payoutType: payoutType || "none",
      payoutAmount: payoutAmount || 0,
      incentiveAmount: incentiveAmount || 0,
      commissionAmount: commissionAmount || 0,
      onTimeThresholdMinutes: onTimeThresholdMinutes || 45
    };

    await rider.save();
    emitToRoom(`deliveryBoy:${id}`, "payout:updated", { rider });
    emitToRoom("admin:global", "payout:updated", { riderId: id, override: rider.payoutOverride });
    res.status(200).json({ success: true, message: "Rider custom payout settings override updated", rider });
  } catch (error) {
    console.error("Update Rider Payout Override Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// --- DELIVERY TIME SLOTS ADMIN MANAGEMENT ---
export const getAdminDeliverySlots = async (req, res) => {
  try {
    const slots = await DeliverySlot.find()
      .populate("vendorIds", "shopName ownerName city")
      .sort({ cutoffTime: 1, startTime: 1 });
    res.status(200).json({ success: true, slots });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createAdminDeliverySlot = async (req, res) => {
  try {
    const { name, startTime, endTime, cutoffTime, isGlobal, vendorIds, isActive, city } = req.body;
    if (!name || !startTime || !endTime || !cutoffTime) {
      return res.status(400).json({ success: false, message: "Name, startTime, endTime, and cutoffTime are required." });
    }
    const newSlot = await DeliverySlot.create({
      name,
      startTime,
      endTime,
      cutoffTime,
      isGlobal: isGlobal !== undefined ? isGlobal : true,
      vendorIds: Array.isArray(vendorIds) ? vendorIds : [],
      isActive: isActive !== undefined ? isActive : true,
      city: city ? city.trim() : null
    });

    // Real-time socket notification broadcast
    emitToRoom("slots:global", "slots:updated", { type: "create", slotId: newSlot._id });

    res.status(201).json({ success: true, message: "Delivery slot created successfully", slot: newSlot });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAdminDeliverySlot = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await DeliverySlot.findByIdAndUpdate(id, req.body, { new: true, runValidators: true })
      .populate("vendorIds", "shopName ownerName city");
    if (!updated) {
      return res.status(404).json({ success: false, message: "Delivery slot not found." });
    }

    // Real-time socket notification broadcast
    emitToRoom("slots:global", "slots:updated", { type: "update", slotId: id });

    res.status(200).json({ success: true, message: "Delivery slot updated successfully", slot: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteAdminDeliverySlot = async (req, res) => {
  try {
    const { id } = req.params;
    await DeliverySlot.findByIdAndDelete(id);

    // Real-time socket notification broadcast
    emitToRoom("slots:global", "slots:updated", { type: "delete", slotId: id });

    res.status(200).json({ success: true, message: "Delivery slot deleted successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
