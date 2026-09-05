import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import CustomerOrder from "../models/CustomerOrder.js";
import Invoice from "../models/Invoice.js";
import User from "../models/User.js";
import Vendor from "../../vendor/models/Vendor.js";
import DeliveryBoy from "../../deliveryBoy/models/DeliveryBoy.js";
import Counter from "../../models/Counter.js";
import { VendorListing, VendorProduct, ProductVariant, ProductReview, Product } from "../../models/catalog.js";
import { calculateOrderFees } from "../../utils/feeCalculator.js";
import { calculateCouponDiscount } from "../../utils/couponCalculator.js";
import { calculateVendorOrderCommission } from "../../utils/commissionCalculator.js";
import { handleOrderCreated, runInTransaction } from "../../utils/ledgerSyncHelper.js";
import { serializeCustomerOrder } from "../../utils/financeSerializer.js";
import { createVendorNotification } from "../../utils/notificationHelper.js";
import { createAdminNotification } from "../../utils/adminNotificationHelper.js";

// Helper: Generate atomic sequential invoice numbers (AR-000001, AR-000002...)
export const getNextInvoiceNumber = async (session = null) => {
  const opts = { new: true, upsert: true };
  if (session) opts.session = session;
  
  const counter = await Counter.findOneAndUpdate(
    { _id: "invoiceNumber" },
    { $inc: { seq: 1 } },
    opts
  );
  
  const numStr = String(counter.seq).padStart(6, "0");
  return `AR-${numStr}`;
};

// Helper: Generate unique IDs
const generateUniqueId = async (prefix, Model, field) => {
  let unique = false;
  let id = "";
  while (!unique) {
    id = `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
    const existing = await Model.findOne({ [field]: id });
    if (!existing) unique = true;
  }
  return id;
};

// @desc    Place a new order (Customer side only)
// @route   POST /api/customer/orders
// @access  Public (Customer)
export const placeOrder = async (req, res) => {
  try {
    let resultOrder = null;
    await runInTransaction(async (session) => {
      const customerId = req.user._id;
      const {
        vendorId,
        items,
        deliveryAddress,
        couponCode,
        paymentMethod,
        deliverySlot,
        customerLiveLocation,
        locationUnavailable,
      } = req.body;

      if (!customerId || !vendorId || !items || items.length === 0 || !deliveryAddress) {
        throw new Error("Missing required order fields.");
      }

      // 1. Resolve item details server-side per vendor
      let serverTotalAmount = 0;
      const resolvedItems = [];
      for (const item of items) {
        let price = Number(item.price || 0);
        const itemVendorId = item.vendorId || vendorId;
        const listing = await VendorListing.findOne({
          vendorId: itemVendorId,
          variantId: item.variantId,
        }).session(session);

        if (listing) {
          price = listing.sellingPrice;
        } else {
          const vpLink = await VendorProduct.findOne({
            vendorId: itemVendorId,
            masterProductId: item.productId,
          }).session(session);

          if (vpLink) {
            price = vpLink.price;
          }
        }

        const qty = Number(item.qty || 1);
        serverTotalAmount += price * qty;
        resolvedItems.push({
          ...item,
          vendorId: itemVendorId,
          price,
          qty,
        });
      }

      // 2. Recalculate coupon discount server-side using shared coupon calculator
      let serverCouponDiscount = 0;
      if (couponCode) {
        const calcResult = await calculateCouponDiscount({
          couponCode,
          items: resolvedItems,
          vendorId,
          customerId,
          session
        });
        if (calcResult.couponError) {
          throw new Error(calcResult.couponError);
        }
        serverCouponDiscount = calcResult.couponDiscount;
      }

      // 3. Recalculate fees server-side based on customer city/zone and total
      const zoneId = deliveryAddress.city || "";
      const { breakdown, totalFees } = await calculateOrderFees(serverTotalAmount, zoneId);

      const finalHandlingFee = breakdown.find(f => f.feeType === "handling")?.amount || 0;
      const finalSmallCartFee = breakdown.find(f => f.feeType === "small_cart")?.amount || 0;
      const finalDeliveryFee = breakdown.find(f => f.feeType === "delivery_partner")?.amount || 0;
      const finalGst = breakdown.find(f => f.feeType === "gst")?.amount || 0;
      const finalRainFee = breakdown.find(f => f.feeType === "rain")?.amount || 0;

      const totalCalculatedFees = finalHandlingFee + finalSmallCartFee + finalDeliveryFee + finalGst + finalRainFee;
      const finalGrandTotal = Math.max(0, serverTotalAmount - serverCouponDiscount + totalCalculatedFees);

      // Prevent duplicate/double order submission (within 15 seconds window)
      const duplicateWindow = new Date(Date.now() - 15 * 1000);
      const potentialDuplicate = await CustomerOrder.findOne({
        customerId,
        grandTotal: finalGrandTotal,
        createdAt: { $gte: duplicateWindow },
      }).session(session);

      if (potentialDuplicate) {
        throw new Error("Duplicate order submission detected. Please wait 15 seconds.");
      }

      // 4. Validate stock availability for each item per vendor and decrement stock
      const operationsToExecute = [];
      for (const item of resolvedItems) {
        const itemVendorId = item.vendorId;
        const listing = await VendorListing.findOne({
          vendorId: itemVendorId,
          variantId: item.variantId,
        }).session(session);

        if (listing) {
          if (listing.stock.quantity < item.qty) {
            throw new Error(`Insufficient stock for variant "${item.name}". Available: ${listing.stock.quantity}, requested: ${item.qty}`);
          }
          const remaining = listing.stock.quantity - item.qty;
          if (remaining <= 5 && remaining >= 0) {
            await createVendorNotification({
              vendorId: itemVendorId,
              title: "Low Stock Alert! ⚠️",
              message: `"${item.name}" is running low — only ${remaining} left in stock.`,
              type: "LOW_STOCK",
              relatedProductId: item.productId,
              session
            });
          }
          operationsToExecute.push({
            type: "listing",
            query: { vendorId: itemVendorId, variantId: item.variantId },
            update: { $inc: { "stock.quantity": -item.qty } },
          });
        } else {
          const vpLink = await VendorProduct.findOne({
            vendorId: itemVendorId,
            masterProductId: item.productId,
          }).session(session);

          if (vpLink) {
            if (vpLink.stock < item.qty) {
              throw new Error(`Insufficient stock for product "${item.name}". Available: ${vpLink.stock}, requested: ${item.qty}`);
            }
            const remaining = vpLink.stock - item.qty;
            if (remaining <= 5 && remaining >= 0) {
              await createVendorNotification({
                vendorId: itemVendorId,
                title: "Low Stock Alert! ⚠️",
                message: `"${item.name}" is running low — only ${remaining} left in stock.`,
                type: "LOW_STOCK",
                relatedProductId: item.productId,
                session
              });
            }
            operationsToExecute.push({
              type: "vendorProduct",
              query: { vendorId: itemVendorId, masterProductId: item.productId },
              update: { $inc: { stock: -item.qty } },
            });
          } else {
            throw new Error(`Product variant "${item.name}" is not listed by vendor.`);
          }
        }
      }

      // Execute stock decrements
      for (const op of operationsToExecute) {
        if (op.type === "listing") {
          await VendorListing.updateOne(op.query, op.update, { session });
        } else if (op.type === "vendorProduct") {
          await VendorProduct.updateOne(op.query, op.update, { session });
        }
      }

      // 5. Generate Unique Order ID & Sequential Invoice Number
      const orderId = await generateUniqueId("AR", CustomerOrder, "orderId");
      const invoiceNumber = await getNextInvoiceNumber(session);

      // 6. Group items by vendorId and calculate per-vendor sub-orders & commissions
      const vendorItemsMap = new Map();
      for (const item of resolvedItems) {
        const vKey = String(item.vendorId);
        if (!vendorItemsMap.has(vKey)) {
          vendorItemsMap.set(vKey, []);
        }
        vendorItemsMap.get(vKey).push(item);
      }

      const vendorSubOrders = [];
      for (const [vKey, vItems] of vendorItemsMap.entries()) {
        const commDetails = await calculateVendorOrderCommission({ items: vItems }, vKey);
        const subtotal = vItems.reduce((acc, it) => acc + (it.price * it.qty), 0);
        
        // Calculate per-item coupon discount allocation if coupon is applied
        let couponDiscountAllocatedTotal = 0;
        const mappedItems = commDetails.items.map((item, idx) => {
          const lineSub = (item.price || 0) * (item.qty || 1);
          let itemCoupon = 0;
          if (serverCouponDiscount > 0 && serverTotalAmount > 0) {
            if (idx === commDetails.items.length - 1) {
              itemCoupon = Math.max(0, Math.round((serverCouponDiscount - couponDiscountAllocatedTotal + Number.EPSILON) * 100) / 100);
            } else {
              itemCoupon = Math.round(((lineSub / serverTotalAmount) * serverCouponDiscount + Number.EPSILON) * 100) / 100;
              couponDiscountAllocatedTotal += itemCoupon;
            }
          }
          return {
            productId: item.productId,
            variantId: item.variantId,
            name: item.name,
            price: item.price,
            qty: item.qty,
            img: item.img,
            calculatedCommissionAmount: item.calculatedCommissionAmount,
            commissionRateApplied: item.commissionRateApplied,
            commissionResolutionLevel: item.commissionResolutionLevel,
            commissionType: item.commissionType || "inherit",
            commissionValue: item.commissionValue !== undefined ? item.commissionValue : null,
            couponDiscount: itemCoupon
          };
        });

        vendorSubOrders.push({
          vendorId: vKey,
          items: mappedItems,
          subOrderStatus: "Pending",
          pickupStatus: "PENDING",
          vendorCommission: {
            rate: commDetails.rate,
            commissionType: commDetails.type,
            amount: commDetails.commissionAmount,
            calculatedAt: new Date()
          },
          subtotal
        });
      }

      const primaryVendorId = vendorSubOrders[0]?.vendorId || vendorId;
      const allFlatItems = vendorSubOrders.flatMap(vso => vso.items);

      // Create the CustomerOrder record
      const [order] = await CustomerOrder.create([
        {
          orderId,
          invoiceNumber,
          customerId,
          vendorId: primaryVendorId,
          vendorSubOrders,
          items: allFlatItems,
          totalAmount: serverTotalAmount,
          deliveryCharge: finalDeliveryFee,
          taxAmount: finalGst,
          handlingFee: finalHandlingFee,
          smallCartFee: finalSmallCartFee,
          rainFee: finalRainFee,
          feeBreakdown: breakdown.map(f => ({ feeType: f.feeType, label: f.label, amount: f.amount })),
          grandTotal: finalGrandTotal,
          couponCode: couponCode || null,
          couponDiscount: serverCouponDiscount,
          paymentMethod: paymentMethod || "COD",
          paymentStatus: paymentMethod === "Online" ? "Paid" : "Pending",
          orderStatus: "Pending",
          deliveryAddress,
          deliverySlot: deliverySlot || null,
          customerLiveLocation: customerLiveLocation || null,
          locationUnavailable: locationUnavailable || false,
          vendorCommission: vendorSubOrders[0]?.vendorCommission || { rate: 0, commissionType: "percentage", amount: 0, calculatedAt: new Date() }
        }
      ], { session });

      if (couponCode && serverCouponDiscount > 0) {
        const Coupon = mongoose.model("Coupon");
        await Coupon.updateOne(
          { code: couponCode.toUpperCase() },
          { $inc: { usedCount: 1 } },
          { session }
        );
      }

      // Update Ledger and daily summary inside the transaction
      await handleOrderCreated(order, session);

      // Trigger Notifications for each participating Vendor
      for (const vso of vendorSubOrders) {
        await createVendorNotification({
          vendorId: vso.vendorId,
          title: "New Order Received! 🛒",
          message: `New order #${order.orderId} received — Subtotal ₹${vso.subtotal.toFixed(2)}`,
          type: "NEW_ORDER",
          relatedOrderId: order._id,
          session
        });
      }

      // Trigger Notification for Admin
      await createAdminNotification({
        title: "New Platform Order 🛒",
        message: `New order #${order.orderId} placed (${vendorSubOrders.length} vendor${vendorSubOrders.length > 1 ? 's' : ''}) — ₹${finalGrandTotal.toFixed(2)}`,
        type: "NEW_ORDER_PLACED",
        relatedVendorId: primaryVendorId,
        relatedOrderId: order._id,
        session
      });

      resultOrder = order;
    });

    console.log(`Notification sent to Customer: Order placed successfully!`);
    const serializedOrder = serializeCustomerOrder(resultOrder);

    res.status(201).json({
      success: true,
      message: "Order placed successfully!",
      order: serializedOrder,
    });
  } catch (error) {
    console.error("Order placement failure:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all orders for a customer user
// @route   GET /api/customer/orders/user/:userId
// @access  Public (Customer)
export const getCustomerOrders = async (req, res) => {
  try {
    const orders = await CustomerOrder.find({ customerId: req.user._id })
      .select("-vendorCommission")
      .populate("vendorId", "shopName phone")
      .populate({ path: "items.variantId", select: "variantLabel packSize name sku" })
      .sort({ createdAt: -1 });

    const serializedOrders = orders.map(order => serializeCustomerOrder(order));

    res.status(200).json({
      success: true,
      orders: serializedOrders,
    });
  } catch (error) {
    console.error("Fetch orders failure:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get order details (tracking page)
// @route   GET /api/customer/orders/:id
// @access  Public (Customer)
export const getOrderById = async (req, res) => {
  try {
    const order = await CustomerOrder.findById(req.params.id)
      .select("-vendorCommission")
      .populate("vendorId", "shopName phone address")
      .populate("customerId", "fullName phoneNumber email")
      .populate({ path: "items.variantId", select: "variantLabel packSize name sku" });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    const orderCustId = order.customerId._id ? order.customerId._id.toString() : order.customerId.toString();
    if (orderCustId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized access to order details." });
    }

    const serializedOrder = serializeCustomerOrder(order);

    res.status(200).json({
      success: true,
      order: serializedOrder,
    });
  } catch (error) {
    console.error("Fetch order details failure:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Download PDF invoice for delivered orders
// @route   GET /api/customer/orders/:id/invoice
// @access  Public (Customer)
// @desc    Download PDF invoice for master order (Customer side)
// @route   GET /api/customer/orders/:id/invoice
// @access  Public (Customer)
export const downloadInvoice = async (req, res) => {
  try {
    const order = await CustomerOrder.findById(req.params.id)
      .populate("customerId", "fullName phoneNumber email")
      .populate("deliveryBoyId", "fullName phone")
      .populate("vendorId", "shopName phone address assignedArea storeDetails serviceAreas")
      .populate({
        path: "vendorSubOrders.vendorId",
        select: "shopName phone address assignedArea storeDetails serviceAreas"
      })
      .populate({
        path: "items.variantId",
        select: "variantLabel packSize name sku"
      });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    const orderCustId = order.customerId?._id ? order.customerId._id.toString() : order.customerId?.toString();
    if (orderCustId && req.user?._id && orderCustId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized access to invoice." });
    }

    // Ensure invoiceNumber is generated (AR-000xxx)
    if (!order.invoiceNumber) {
      order.invoiceNumber = await getNextInvoiceNumber();
      await order.save();
    }

    // Resolve or create Invoice record for auditing
    let invoice = await Invoice.findOne({ orderId: order._id });
    if (!invoice) {
      const invoiceId = await generateUniqueId("INV", Invoice, "invoiceId");
      invoice = await Invoice.create({
        invoiceId,
        orderId: order._id,
        customerId: order.customerId?._id || order.customerId,
        vendorId: order.vendorId?._id || order.vendorId,
        totalAmount: order.grandTotal,
      });
    }

    // Date & Time formatting
    const orderDate = new Date(order.createdAt || invoice.invoiceDate || Date.now());
    const dateStr = orderDate.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const timeStr = orderDate.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const formattedDateTime = `${dateStr}, ${timeStr}`;

    // Initialize PDF Document
    const doc = new PDFDocument({ margin: 40, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=invoice_${order.orderId}.pdf`);

    doc.pipe(res);

    // Color Palette
    const BRAND_GREEN = "#0B2214";
    const ACCENT_GREEN = "#047857";
    const TINT_GREEN = "#ECFDF5";
    const BORDER_GREEN = "#A7F3D0";
    const DARK_TEXT = "#1E293B";
    const MUTED_TEXT = "#64748B";
    const BORDER_GRAY = "#E2E8F0";

    // ── HEADER ──
    doc
      .fillColor(BRAND_GREEN)
      .fontSize(22)
      .font("Helvetica-Bold")
      .text("ARYUSHA", 40, 40)
      .fillColor(MUTED_TEXT)
      .fontSize(8.5)
      .font("Helvetica")
      .text("Fresh groceries, delivered fast — aryusha.in", 40, 66);

    // Right Header Info
    doc
      .fillColor(BRAND_GREEN)
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("TAX INVOICE", 350, 40, { width: 205, align: "right" })
      .fillColor(DARK_TEXT)
      .fontSize(9)
      .font("Helvetica")
      .text(`Invoice No: ${order.invoiceNumber || invoice.invoiceId}`, 350, 58, { width: 205, align: "right" })
      .text(`Order ID: ${order.orderId}`, 350, 70, { width: 205, align: "right" })
      .text(`Date: ${formattedDateTime}`, 350, 82, { width: 205, align: "right" });

    // Header Divider Line
    doc
      .strokeColor(BRAND_GREEN)
      .lineWidth(2)
      .moveTo(40, 98)
      .lineTo(555, 98)
      .stroke();

    // ── THREE-COLUMN META ROW ──
    const metaY = 110;

    // Col 1: Billed To
    doc
      .fillColor(BRAND_GREEN)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("BILLED TO", 40, metaY)
      .fillColor(DARK_TEXT)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text(order.deliveryAddress?.fullName || order.customerId?.fullName || "Valued Customer", 40, metaY + 14)
      .fillColor(MUTED_TEXT)
      .fontSize(8.5)
      .font("Helvetica")
      .text(`Ph: ${order.deliveryAddress?.phoneNumber || order.customerId?.phoneNumber || "N/A"}`, 40, metaY + 26);

    const addrStr = order.deliveryAddress
      ? `${order.deliveryAddress.houseNo || ""}, ${order.deliveryAddress.area || ""}, ${order.deliveryAddress.city || ""}, ${order.deliveryAddress.state || ""} - ${order.deliveryAddress.pincode || ""}`
      : "Delivery Address N/A";
    doc.text(addrStr, 40, metaY + 38, { width: 160 });

    // Col 2: Delivered By & Status Pill
    const fulfillingVendor = order.vendorId || (order.vendorSubOrders && order.vendorSubOrders[0]?.vendorId);
    const vendorZone = fulfillingVendor?.assignedArea || fulfillingVendor?.storeDetails?.assignedArea || fulfillingVendor?.address?.area || fulfillingVendor?.address?.city || order.deliveryAddress?.area || "Local Service Area";

    doc
      .fillColor(BRAND_GREEN)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("DELIVERED BY", 215, metaY)
      .fillColor(DARK_TEXT)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("Aryusha", 215, metaY + 14, { width: 160 })
      .fillColor(MUTED_TEXT)
      .fontSize(8.5)
      .font("Helvetica")
      .text(`Zone: ${vendorZone}`, 215, metaY + 26);

    // Status Pill
    const isDelivered = order.orderStatus === "Delivered";
    const statusText = isDelivered ? "✓ Delivered" : (order.orderStatus ? order.orderStatus.replace(/_/g, " ") : "In Progress");

    doc
      .roundedRect(215, metaY + 54, 110, 18, 4)
      .fillAndStroke(TINT_GREEN, BORDER_GREEN);

    doc
      .fillColor(ACCENT_GREEN)
      .fontSize(8)
      .font("Helvetica-Bold")
      .text(statusText, 215, metaY + 59, { width: 110, align: "center" });

    // Col 3: Payment Info
    const isCOD = order.paymentMethod === "COD" || order.paymentMethod === "Cash on Delivery";
    const payStatus = isCOD ? (isDelivered ? "Paid (COD)" : "Due (Pay on Delivery)") : (order.paymentStatus || "Paid");
    const payMethod = order.paymentMethod || "Online Payment";
    const txnId = order.paymentDetails?.transactionId || order.razorpayPaymentId || (isCOD ? "N/A (Cash on Delivery)" : "N/A");

    doc
      .fillColor(BRAND_GREEN)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("PAYMENT DETAILS", 390, metaY)
      .fillColor(MUTED_TEXT)
      .fontSize(8.5)
      .font("Helvetica")
      .text("Mode: ", 390, metaY + 14)
      .fillColor(DARK_TEXT)
      .font("Helvetica-Bold")
      .text(payMethod, 435, metaY + 14)
      .fillColor(MUTED_TEXT)
      .font("Helvetica")
      .text("Status: ", 390, metaY + 26)
      .fillColor(payStatus.includes("Due") ? "#B45309" : ACCENT_GREEN)
      .font("Helvetica-Bold")
      .text(payStatus, 435, metaY + 26)
      .fillColor(MUTED_TEXT)
      .font("Helvetica")
      .text("Txn ID: ", 390, metaY + 38)
      .fillColor(DARK_TEXT)
      .font("Helvetica")
      .text(txnId, 435, metaY + 38, { width: 120 });

    // ── ITEMS TABLE ──
    const tableTop = 205;

    // Table Header Background
    doc
      .rect(40, tableTop, 515, 20)
      .fill(BRAND_GREEN);

    // Table Header Text
    doc
      .fillColor("#FFFFFF")
      .fontSize(8.5)
      .font("Helvetica-Bold")
      .text("S.No", 45, tableTop + 5, { width: 25 })
      .text("Item Description", 75, tableTop + 5, { width: 230 })
      .text("Qty", 310, tableTop + 5, { width: 45, align: "right" })
      .text("Unit Price", 365, tableTop + 5, { width: 75, align: "right" })
      .text("Amount", 450, tableTop + 5, { width: 95, align: "right" });

    // Items Rendering
    let currentY = tableTop + 24;
    const itemsList = order.items || [];

    itemsList.forEach((item, index) => {
      let variantDesc = "";
      if (item.variantLabel) {
        variantDesc = item.variantLabel;
      } else if (item.variantName) {
        variantDesc = item.variantName;
      } else if (item.variant) {
        variantDesc = typeof item.variant === "string" ? item.variant : (item.variant.variantLabel || item.variant.name || "");
      } else if (item.variantId && typeof item.variantId === "object") {
        if (item.variantId.variantLabel) {
          variantDesc = item.variantId.variantLabel;
        } else if (item.variantId.packSize && item.variantId.packSize.value && item.variantId.packSize.unit) {
          variantDesc = `${item.variantId.packSize.value} ${item.variantId.packSize.unit}`;
        }
      } else if (item.packSize) {
        variantDesc = typeof item.packSize === "string" ? item.packSize : (item.packSize.value && item.packSize.unit ? `${item.packSize.value} ${item.packSize.unit}` : "");
      } else if (item.unit) {
        variantDesc = item.unit;
      } else if (item.weight) {
        variantDesc = item.weight;
      } else {
        variantDesc = item.brand || "";
      }

      const unitPrice = Number(item.price || 0);
      const itemQty = Number(item.qty !== undefined && item.qty !== null ? item.qty : (item.quantity !== undefined && item.quantity !== null ? item.quantity : 1));
      const lineTotal = unitPrice * itemQty;

      doc
        .fillColor(DARK_TEXT)
        .fontSize(8.5)
        .font("Helvetica")
        .text((index + 1).toString(), 45, currentY, { width: 25 })
        .font("Helvetica-Bold")
        .text(item.name, 75, currentY, { width: 230 });

      if (variantDesc) {
        doc
          .fillColor(MUTED_TEXT)
          .fontSize(7.5)
          .font("Helvetica")
          .text(`Variant: ${variantDesc}`, 75, currentY + 11, { width: 230 });
      }

      doc
        .fillColor(DARK_TEXT)
        .fontSize(8.5)
        .font("Helvetica")
        .text(itemQty.toString(), 310, currentY, { width: 45, align: "right" })
        .text(`₹${unitPrice.toFixed(2)}`, 365, currentY, { width: 75, align: "right" })
        .font("Helvetica-Bold")
        .text(`₹${lineTotal.toFixed(2)}`, 450, currentY, { width: 95, align: "right" });

      const rowHeight = variantDesc ? 24 : 18;
      currentY += rowHeight;

      // Subtle horizontal line separator
      doc
        .strokeColor(BORDER_GRAY)
        .lineWidth(0.5)
        .moveTo(40, currentY - 2)
        .lineTo(555, currentY - 2)
        .stroke();
    });

    currentY += 8;

    // ── TOTALS SECTION ──
    const totalsX = 320;
    const itemTotal = order.totalAmount || (order.items || []).reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.qty) || 0), 0) || 0;
    const deliveryFee = order.deliveryCharge || order.deliveryFee || 0;
    const platformFee = order.platformFee !== undefined ? order.platformFee : ((Number(order.handlingFee || 0) + Number(order.smallCartFee || 0) + Number(order.rainFee || 0)) || 0);
    const taxAmount = order.taxAmount || 0;
    const discount = order.couponDiscount || order.discountAmount || 0;

    doc.fontSize(8.5).font("Helvetica");

    // Item Total
    doc
      .fillColor(MUTED_TEXT)
      .text("Item Total:", totalsX, currentY, { width: 130, align: "right" })
      .fillColor(DARK_TEXT)
      .text(`₹${itemTotal.toFixed(2)}`, 450, currentY, { width: 95, align: "right" });
    currentY += 14;

    // Delivery Fee
    doc
      .fillColor(MUTED_TEXT)
      .text("Delivery Fee:", totalsX, currentY, { width: 130, align: "right" })
      .fillColor(DARK_TEXT)
      .text(`₹${deliveryFee.toFixed(2)}`, 450, currentY, { width: 95, align: "right" });
    currentY += 14;

    // Platform Fee
    doc
      .fillColor(MUTED_TEXT)
      .text("Platform Fee:", totalsX, currentY, { width: 130, align: "right" })
      .fillColor(DARK_TEXT)
      .text(`₹${platformFee.toFixed(2)}`, 450, currentY, { width: 95, align: "right" });
    currentY += 14;

    // Taxes (GST)
    doc
      .fillColor(MUTED_TEXT)
      .text("Taxes (GST):", totalsX, currentY, { width: 130, align: "right" })
      .fillColor(DARK_TEXT)
      .text(`₹${taxAmount.toFixed(2)}`, 450, currentY, { width: 95, align: "right" });
    currentY += 14;

    // Coupon Discount (only if applicable)
    if (discount > 0 || order.couponCode) {
      const couponLabel = order.couponCode ? `Coupon (${order.couponCode}):` : "Coupon Discount:";
      doc
        .fillColor(ACCENT_GREEN)
        .font("Helvetica-Bold")
        .text(couponLabel, totalsX, currentY, { width: 130, align: "right" })
        .text(`- ₹${discount.toFixed(2)}`, 450, currentY, { width: 95, align: "right" });
      currentY += 14;
    }

    currentY += 4;

    // Grand Total Divider & Row
    doc
      .strokeColor(BRAND_GREEN)
      .lineWidth(1.5)
      .moveTo(totalsX, currentY)
      .lineTo(555, currentY)
      .stroke();

    currentY += 6;

    doc
      .fillColor(BRAND_GREEN)
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Grand Total:", totalsX, currentY, { width: 130, align: "right" })
      .text(`₹${order.grandTotal.toFixed(2)}`, 450, currentY, { width: 95, align: "right" });

    currentY += 30;

    // ── COMPLIANCE NOTE BOX ──
    const noteY = Math.max(currentY, 680);
    doc
      .roundedRect(40, noteY, 515, 45, 6)
      .fillAndStroke("#F8FAFC", BORDER_GRAY);

    doc
      .fillColor(MUTED_TEXT)
      .fontSize(7)
      .font("Helvetica")
      .text(
        "Notice: Aryusha is currently operating on a proprietary basis during initial rollout and is in process of formal corporate registration. A formal GST tax invoice with GSTIN will be updated post-incorporation. All taxes and platform fees are inclusive as indicated.",
        48,
        noteY + 8,
        { width: 499, align: "left" }
      );

    // ── FOOTER DISCLAIMER ──
    const footerY = noteY + 54;
    doc
      .fillColor(MUTED_TEXT)
      .fontSize(7.5)
      .font("Helvetica")
      .text("This is a system-generated invoice from Aryusha and does not require a signature.", 40, footerY)
      .text("Support: support@aryusha.in | aryusha.in", 350, footerY, { width: 205, align: "right" });

    doc.end();
  } catch (error) {
    console.error("PDF Invoice download failure:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get order live tracking details
// @route   GET /api/customer/orders/:id/tracking
// @access  Protected (Customer)
export const getOrderTracking = async (req, res) => {
  try {
    const order = await CustomerOrder.findById(req.params.id)
      .populate("deliveryBoyId", "fullName phone latitude longitude");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    // Ownership check
    if (order.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized access to order tracking." });
    }

    // Dynamic ETA calculation if active
    let eta = null;
    if (["On_the_Way", "Reached_Customer"].includes(order.deliveryStatus)) {
      eta = "12-15 Mins";
    } else if (order.deliveryStatus === "Assigned" || order.deliveryStatus === "Picked_Up") {
      eta = "20-25 Mins";
    }

    res.status(200).json({
      success: true,
      tracking: {
        orderId: order.orderId,
        deliveryStatus: order.deliveryStatus,
        orderStatus: order.orderStatus,
        deliveryAddress: order.deliveryAddress,
        liveTracking: order.liveTracking !== false, // default to true
        eta,
        deliveryOtp: order.deliveryOtp,
        deliveryBoy: order.deliveryBoyId ? {
          fullName: order.deliveryBoyId.fullName,
          phone: order.deliveryBoyId.phone,
          rating: 4.8, // Mock rating
          latitude: order.deliveryBoyId.latitude,
          longitude: order.deliveryBoyId.longitude
        } : null,
        deliveryLogs: order.deliveryLogs,
        updatedAt: order.updatedAt
      }
    });
  } catch (error) {
    console.error("Order tracking fetch error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get order delivery OTP
// @route   GET /api/customer/orders/:id/otp
// @access  Protected (Customer)
export const getOrderOtp = async (req, res) => {
  try {
    const order = await CustomerOrder.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    // Ownership check
    if (order.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized access to OTP." });
    }

    res.status(200).json({
      success: true,
      otp: order.deliveryOtp
    });
  } catch (error) {
    console.error("Fetch OTP error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Rate an order
// @route   PUT /api/customer/orders/:id/rate
// @access  Private (Customer)
export const rateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, feedback } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be between 1 and 5." });
    }

    const order = await CustomerOrder.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    // Enforce owner check
    if (order.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized to rate this order." });
    }

    order.rating = rating;
    order.ratingFeedback = feedback || "";
    await order.save();

    // Create or update ProductReview for each item in the order
    for (const item of order.items) {
      const productId = item.productId;
      const targetVendorId = order.vendorId;

      const product = await Product.findById(productId);
      if (!product) continue;

      let review = await ProductReview.findOne({
        productId,
        vendorId: targetVendorId,
        customerId: req.user._id
      });

      if (review) {
        review.rating = rating;
        review.reviewText = feedback || "";
        review.orderId = order._id;
        await review.save();
      } else {
        review = await ProductReview.create({
          productId,
          vendorId: targetVendorId,
          customerId: req.user._id,
          orderId: order._id,
          customerName: req.user.fullName || req.user.name || "Customer",
          rating,
          reviewText: feedback || "",
          isVerifiedPurchase: true
        });
      }

      // Recalculate average rating & total reviews for this vendor product
      const allReviews = await ProductReview.find({ productId, vendorId: targetVendorId });
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
          { masterProductId: productId, vendorId: targetVendorId },
          { averageRating, totalReviews }
        );
      }
    }

    res.status(200).json({ success: true, message: "Thank you for rating the order!" });
  } catch (error) {
    console.error("Error rating order:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
