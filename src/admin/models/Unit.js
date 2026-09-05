import mongoose from "mongoose";

const stepOptionSchema = new mongoose.Schema(
  {
    value: { type: Number, required: true, min: 0.001 },
    unit: { type: String, required: true, trim: true },
    label: { type: String, trim: true }
  },
  { _id: false }
);

const unitSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Unit name is required"],
      unique: true,
      trim: true,
    },
    shortName: {
      type: String,
      required: [true, "Short name is required"],
      trim: true,
    },
    categoryType: {
      type: String,
      enum: ["weight", "volume", "count"],
      required: true,
      default: "weight",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    stepOptions: {
      type: [stepOptionSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast lookups
unitSchema.index({ categoryType: 1, isActive: 1, isDeleted: 1 });
unitSchema.index({ isDeleted: 1, createdAt: -1 });

const Unit = mongoose.models.Unit || mongoose.model("Unit", unitSchema);

export default Unit;
