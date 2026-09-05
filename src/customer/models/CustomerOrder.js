import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ProductVariant",
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  qty: {
    type: Number,
    required: true,
    min: 1,
  },
  img: {
    type: String,
    default: "",
  },
  calculatedCommissionAmount: {
    type: Number,
    default: 0,
  },
  commissionRateApplied: {
    type: Number,
    default: 0,
  },
  commissionResolutionLevel: {
    type: String,
    enum: ["vendorProduct", "product", "vendor", "global", "none"],
    default: "none",
  },
  commissionType: {
    type: String,
    enum: ["percentage", "flat", "inherit"],
    default: "inherit",
  },
  commissionValue: {
    type: Number,
    default: null,
  },
  couponDiscount: {
    type: Number,
    default: 0,
  },
});

const vendorSubOrderSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vendor",
    required: true,
  },
  items: [orderItemSchema],
  subOrderStatus: {
    type: String,
    enum: ["Pending", "Accepted", "Packed", "Picked", "Delivered", "Rejected", "Cancelled"],
    default: "Pending",
  },
  pickupStatus: {
    type: String,
    enum: ["PENDING", "READY_FOR_PICKUP", "PICKED"],
    default: "PENDING",
  },
  vendorCommission: {
    rate: { type: Number, default: 0 },
    commissionType: { type: String, enum: ["percentage", "flat", "mixed"], default: "percentage" },
    amount: { type: Number, default: 0 },
    calculatedAt: { type: Date, default: null }
  },
  subtotal: {
    type: Number,
    default: 0
  }
});

const customerOrderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    invoiceNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: false,
    },
    vendorSubOrders: [vendorSubOrderSchema],
    items: [orderItemSchema],
    totalAmount: {
      type: Number,
      required: true,
    },
    deliveryCharge: {
      type: Number,
      default: 0,
    },
    riderPayout: {
      type: Number,
      default: null,
    },
    taxAmount: {
      type: Number,
      default: 0,
    },
    grandTotal: {
      type: Number,
      required: true,
    },
    couponCode: {
      type: String,
      default: null,
    },
    couponDiscount: {
      type: Number,
      default: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["COD", "Online"],
      default: "COD",
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed"],
      default: "Pending",
    },
    orderStatus: {
      type: String,
      enum: [
        "Pending",
        "Accepted",
        "Partially_Accepted",
        "Packed",
        "Out_for_Delivery",
        "Delivered",
        "Rejected",
        "Cancelled",
      ],
      default: "Pending",
    },
    deliverySlot: {
      date: { type: String, default: null },
      time: { type: String, default: null },
    },
    deliveryAddress: {
      fullName: { type: String, required: true },
      phoneNumber: { type: String, required: true },
      houseNo: { type: String, required: true },
      area: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
      latitude: { type: Number },
      longitude: { type: Number },
    },
    deliveryBoyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryBoy",
      default: null,
    },
    deliveryStatus: {
      type: String,
      enum: ["None", "Assigned", "Picked_Up", "On_the_Way", "Reached_Customer", "Delivered"],
      default: "None",
    },
    deliveryOtp: {
      type: String,
      default: null,
    },
    deliveryLogs: [
      {
        status: String,
        timestamp: { type: Date, default: Date.now },
        latitude: Number,
        longitude: Number,
        note: String,
      },
    ],
    customerLiveLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      accuracy: { type: Number, default: null },
      capturedAt: { type: Date, default: null },
    },
    locationUnavailable: {
      type: Boolean,
      default: false,
    },
    liveTracking: {
      type: Boolean,
      default: true,
    },
    handlingFee: {
      type: Number,
      default: 0,
    },
    smallCartFee: {
      type: Number,
      default: 0,
    },
    rainFee: {
      type: Number,
      default: 0,
    },
    feeBreakdown: [
      {
        feeType: String,
        label: String,
        amount: Number,
      }
    ],
    rating: {
      type: Number,
      default: null,
    },
    ratingFeedback: {
      type: String,
      default: "",
    },
    vendorCommission: {
      rate: { type: Number, default: 0 },
      commissionType: { type: String, enum: ["percentage", "flat", "mixed"], default: "percentage" },
      amount: { type: Number, default: 0 },
      calculatedAt: { type: Date, default: null }
    },
  },
  {
    timestamps: true,
  }
);

customerOrderSchema.index({ vendorId: 1, createdAt: -1 });
customerOrderSchema.index({ vendorId: 1, orderStatus: 1, createdAt: -1 });
customerOrderSchema.index({ "vendorSubOrders.vendorId": 1, "vendorSubOrders.subOrderStatus": 1 });
customerOrderSchema.index({ orderStatus: 1, createdAt: -1 });
customerOrderSchema.index({ createdAt: -1 });
customerOrderSchema.index({ invoiceNumber: 1 }, { unique: true, sparse: true });

export default mongoose.model("CustomerOrder", customerOrderSchema);
