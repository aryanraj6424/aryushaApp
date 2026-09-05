import mongoose from "mongoose";

const deliveryBoySchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    vehicleDetails: {
      type: { type: String, default: "Bike" },
      number: { type: String, default: "" },
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },
    accountStatus: {
      type: String,
      enum: ["active", "hold", "suspended", "deactivated"],
      default: "active",
    },
    otp: {
      type: String,
      default: null,
    },
    otpExpiry: {
      type: Date,
      default: null,
    },
    latitude: {
      type: Number,
      default: 28.6139,
    },
    longitude: {
      type: Number,
      default: 77.2090,
    },
    email: {
      type: String,
      default: "",
    },
    city: {
      type: String,
      default: "",
    },
    preferredWorkingLocation: {
      address: { type: String, default: "" },
      latitude: { type: Number, default: 0 },
      longitude: { type: Number, default: 0 },
    },
    preferredShift: {
      type: String,
      enum: ["Morning", "Afternoon", "Evening", "Night", "None"],
      default: "None",
    },
    onboardingStatus: {
      type: String,
      enum: [
        "signup_pending",
        "kyc_pending",
        "kyc_verified",
        "training_pending",
        "training_completed",
        "agreement_pending",
        "active"
      ],
      default: "signup_pending",
    },
    vehicleTypeSelection: {
      type: String,
      enum: ["own_bike", "scooter", "e_rickshaw", "electric_vehicle", "bicycle", "none"],
      default: "none",
    },
    documents: [
      {
        docType: {
          type: String,
          enum: ["aadhaar", "pan", "driving_license", "vehicle_rc", "insurance", "photo", "selfie"]
        },
        fileUrl: String,
        fileType: String, // "image" or "pdf"
        uploadedAt: { type: Date, default: Date.now },
        verificationStatus: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
        rejectionReason: String,
        verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
        verifiedAt: Date
      }
    ],
    bankDetails: {
      accountNumber: { type: String, default: "" },
      ifscCode: { type: String, default: "" },
      accountHolderName: { type: String, default: "" },
      passbookImage: { type: String, default: "" }
    },
    trainingChecklist: [
      {
        moduleName: String,
        type: { type: String, enum: ["video", "in_person"] },
        completed: { type: Boolean, default: false },
        completedAt: Date
      }
    ],
    assignedStoreId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null,
    },
    agreement: {
      signed: { type: Boolean, default: false },
      signedAt: Date,
      ipAddress: String,
      typedName: String,
      agreementPdfUrl: String
    },
    payoutOverride: {
      payoutType: { type: String, enum: ["monthly", "daily", "per_order", "none"], default: "none" },
      payoutAmount: Number,
      incentiveAmount: Number,
      commissionAmount: Number,
      onTimeThresholdMinutes: Number
    },
    isOnline: {
      type: Boolean,
      default: false
    },
  },
  {
    timestamps: true,
  }
);

const DeliveryBoy = mongoose.models.DeliveryBoy || mongoose.model("DeliveryBoy", deliveryBoySchema);
export default DeliveryBoy;
