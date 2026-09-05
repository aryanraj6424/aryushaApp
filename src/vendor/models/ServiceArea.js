import mongoose from "mongoose";

const serviceAreaSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    
    // Location Details
    state: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    zone: {
      type: String,
      required: true,
    },
    pincode: {
      type: String,
      required: true,
    },
    
    // Geolocation
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    
    // Service Configuration
    serviceRadius: {
      type: Number,
      required: true,
      default: 5, // in kilometers
    },
    
    // Status
    isActive: {
      type: Boolean,
      default: true,
    },
    
    // Metadata
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster lookups
serviceAreaSchema.index({ vendor: 1, isActive: 1 });
serviceAreaSchema.index({ pincode: 1 });
serviceAreaSchema.index({ state: 1, city: 1, zone: 1 });

// Geospatial index for location-based queries
serviceAreaSchema.index({ latitude: 1, longitude: 1 });

export default mongoose.model("ServiceArea", serviceAreaSchema);
