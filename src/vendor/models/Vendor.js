// import mongoose from "mongoose";

// const vendorSchema = new mongoose.Schema(
//   {
//     shopName: {
//       type: String,
//       required: true,
//     },

//     shopType: {
//       type: String,
//       required: true,
//     },

//     yearsInBusiness: {
//       type: Number,
//     },

//     employees: {
//       type: Number,
//     },

//     businessEmail: {
//       type: String,
//       required: true,
//       unique: true,
//     },

//     phone: {
//       type: String,
//       required: true,
//       unique: true,
//     },

//     whatsapp: {
//       type: String,
//     },

//     address: {
//       village: String,
//       district: String,
//       state: String,
//       pincode: String,
//       country: String,
//     },

//     documents: {
//       businessRegNo: String,
//       gstNumber: String,
//       resellerCertificate: String,
//       aadhaar: String,
//       pan: String,

//       storeFrontImage: String,
//       storeBackImage: String,
//     },

//     password: {
//       type: String,
//       required: true,
//     },

//     otp: {
//   type: String,
//   default: null,
// },

// otpExpiry: {
//   type: Date,
//   default: null,
// },

//     status: {
//       type: String,
//       enum: [
//         "pending",
//         "approved",
//         "rejected",
//       ],
//       default: "pending",
//     },

//     assignedArea: {
//       type: String,
//       default: null,
//     },

    

//     assignedRadius: {
//       type: Number,
//       default: null,
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// export default mongoose.model(
//   "Vendor",
//   vendorSchema
// );


import mongoose from "mongoose";

const vendorSchema = new mongoose.Schema(
  {
    shopName: {
      type: String,
      required: true,
    },

    shopType: {
      type: String,
      required: true,
    },

    yearsInBusiness: {
      type: Number,
    },

    employees: {
      type: Number,
    },

    businessEmail: {
      type: String,
      required: true,
      unique: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
    },

    whatsapp: {
      type: String,
    },

    address: {
      village: String,
      district: String,
      state: String,
      pincode: String,
      country: String,
      city: String,
      addressLine: String,
    },

    documents: {
      businessRegNo: String,
      gstNumber: String,
      resellerCertificate: String,
      aadhaar: String,
      pan: String,
      fssai: String,

      storeFrontImage: String,
      storeBackImage: String,

      bankDetails: {
        accountHolder: String,
        accountNumber: String,
        ifsc: String,
        bankName: String,
      },
    },

    ownerDetails: {
      ownerName: String,
      mobileNumber: String,
      email: String,
      profilePhoto: String,
    },

    storeDetails: {
      storeName: String,
      storeLogo: String,
      storeAddress: String,
      city: String,
      state: String,
      pincode: String,
      serviceAreas: [String],
      storeStatus: {
        type: String,
        enum: ["open", "closed"],
        default: "open",
      },
    },

    password: {
      type: String,
      required: true,
    },

    otp: {
      type: String,
      default: null,
    },

    otpExpiry: {
      type: Date,
      default: null,
    },

    // Registration Approval Status
    status: {
      type: String,
      enum: [
        "pending",
        "approved",
        "rejected",
      ],
      default: "pending",
    },

    // Account Control Status
    accountStatus: {
      type: String,
      enum: [
        "active",
        "hold",
        "suspended",
        "deactivated",
      ],
      default: "active",
    },

    assignedArea: {
      type: String,
      default: null,
    },

    assignedRadius: {
      type: Number,
      default: null,
    },

    latitude: {
      type: Number,
      default: null,
    },

    longitude: {
      type: Number,
      default: null,
    },

    deliveryRadius: {
      type: Number,
      default: null,
    },

    radiusKm: {
      type: Number,
      default: null,
      min: [0, "Radius cannot be negative"]
    },

    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
      },
    },

    serviceAreas: [
      {
        pincode: {
          type: String,
          required: true,
        },
        areaName: {
          type: String,
          required: true,
        },
        city: {
          type: String,
          required: true,
        },
        state: {
          type: String,
          required: true,
        },
      },
    ],
    commissionType: {
      type: String,
      enum: ["percentage", "flat"],
      default: "percentage",
    },
    commissionValue: {
      type: Number,
      default: null,
    },
    commissionUpdatedAt: {
      type: Date,
      default: null,
    },
    commissionUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Synchronize coordinates and radius fields on save
vendorSchema.pre("save", function () {
  if (this.latitude !== null && this.longitude !== null && this.latitude !== undefined && this.longitude !== undefined) {
    this.location = {
      type: "Point",
      coordinates: [Number(this.longitude), Number(this.latitude)],
    };
  } else {
    this.location = undefined;
  }

  // Synchronize deliveryRadius, radiusKm, and assignedRadius tri-directionally
  if (this.isModified("deliveryRadius")) {
    this.radiusKm = this.deliveryRadius;
    this.assignedRadius = this.deliveryRadius;
  } else if (this.isModified("radiusKm")) {
    this.deliveryRadius = this.radiusKm;
    this.assignedRadius = this.radiusKm;
  } else if (this.isModified("assignedRadius")) {
    this.deliveryRadius = this.assignedRadius;
    this.radiusKm = this.assignedRadius;
  }
});

// Spatial index for geolocation queries
vendorSchema.index({ location: "2dsphere" });

export default mongoose.model(
  "Vendor",
  vendorSchema
);