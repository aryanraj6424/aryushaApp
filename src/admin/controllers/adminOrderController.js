import mongoose from "mongoose";
import CustomerOrder from "../../customer/models/CustomerOrder.js";
import { handleOrderStatusChange, runInTransaction } from "../../utils/ledgerSyncHelper.js";
import { serializeAdminOrder } from "../../utils/financeSerializer.js";

// Get All Orders (Admin Panel)
export const getAllOrders = async (req, res) => {
  try {
    const orders = await CustomerOrder.find()
      .populate("customerId", "fullName email phoneNumber")
      .populate("vendorId", "shopName phone")
      .populate("deliveryBoyId", "fullName phone")
      .sort({ createdAt: -1 });

    const mappedOrders = orders.map((order) => {
      const obj = serializeAdminOrder(order);
      return {
        ...obj,
        status: (order.orderStatus || "Pending").toLowerCase(), // map for admin frontent status badge
        customer: {
          name: order.customerId?.fullName || order.deliveryAddress?.fullName || "N/A",
          email: order.customerId?.email || "N/A",
          phone: order.customerId?.phoneNumber || order.deliveryAddress?.phoneNumber || "N/A",
        },
      };
    });

    res.status(200).json({
      success: true,
      orders: mappedOrders,
    });
  } catch (error) {
    console.error("Admin Get Orders Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Order By ID (Admin Panel)
export const getOrderById = async (req, res) => {
  try {
    const order = await CustomerOrder.findById(req.params.id)
      .populate("customerId", "fullName email phoneNumber")
      .populate("vendorId", "shopName phone address")
      .populate("deliveryBoyId", "fullName phone");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const obj = serializeAdminOrder(order);
    const mappedOrder = {
      ...obj,
      status: (order.orderStatus || "Pending").toLowerCase(),
      customer: {
        name: order.customerId?.fullName || order.deliveryAddress?.fullName || "N/A",
        email: order.customerId?.email || "N/A",
        phone: order.customerId?.phoneNumber || order.deliveryAddress?.phoneNumber || "N/A",
      },
    };

    res.status(200).json({
      success: true,
      order: mappedOrder,
    });
  } catch (error) {
    console.error("Admin Get Order By ID Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Order Status (Admin Panel)
export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body; // pending, processing, shipped, delivered, cancelled
    let resultOrder = null;

    await runInTransaction(async (session) => {
      const order = await CustomerOrder.findById(req.params.id).session(session);

      if (!order) {
        throw new Error("Order not found");
      }

      // Map status from admin lowercase format to schema capitalization
      const statusMapping = {
        pending: "Pending",
        processing: "Accepted",
        shipped: "Out_for_Delivery",
        delivered: "Delivered",
        cancelled: "Cancelled",
      };

      const targetStatus = statusMapping[status.toLowerCase()];
      if (targetStatus) {
        order.orderStatus = targetStatus;
        
        // Update deliveryStatus to match
        if (targetStatus === "Out_for_Delivery") {
          order.deliveryStatus = "On_the_Way";
        } else if (targetStatus === "Delivered") {
          order.deliveryStatus = "Delivered";
          order.paymentStatus = "Paid";
        }

        order.deliveryLogs.push({
          status: order.deliveryStatus,
          timestamp: new Date(),
          note: `Order status updated to ${targetStatus} by Administrator`,
        });

        await order.save({ session });

        // Sync ledger status and adjust summaries if cancelled
        await handleOrderStatusChange(order._id, targetStatus, session);
      }
      resultOrder = order;
    });

    res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      order: resultOrder,
    });
  } catch (error) {
    console.error("Admin Update Order Status Error:", error);
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// Delete Order (Admin Panel)
export const deleteOrder = async (req, res) => {
  try {
    const order = await CustomerOrder.findByIdAndDelete(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    res.status(200).json({
      success: true,
      message: "Order deleted successfully",
    });
  } catch (error) {
    console.error("Admin Delete Order Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
