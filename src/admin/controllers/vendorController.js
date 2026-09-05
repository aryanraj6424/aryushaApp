import Vendor from "../../vendor/models/Vendor.js";
import VendorPermission from "../../vendor/models/VendorPermission.js";
import VendorEarnings from "../../vendor/models/VendorEarnings.js";
import Commission from "../../vendor/models/Commission.js";
import bcrypt from "bcryptjs";
import { createVendorNotification } from "../../utils/notificationHelper.js";

// Get Pending Vendors
export const getPendingVendors =
  async (req, res) => {
    try {
      const vendors =
        await Vendor.find({
          status: "pending",
        });

      res.status(200).json({
        success: true,
        vendors,
      });
    } catch (error) {
      console.log(error);

      res.status(500).json({
        success: false,
        message:
          "Server Error",
      });
    }
  };

// Approve Vendor
export const approveVendor =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const vendor =
        await Vendor.findById(id);

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message:
            "Vendor not found",
        });
      }

      vendor.status =
        "approved";

      await vendor.save();

      res.status(200).json({
        success: true,
        message:
          "Vendor approved successfully",
      });
    } catch (error) {
      console.log(error);

      res.status(500).json({
        success: false,
        message:
          "Server Error",
      });
    }
  };

// Reject Vendor
export const rejectVendor =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const vendor =
        await Vendor.findById(id);

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message:
            "Vendor not found",
        });
      }

      vendor.status =
        "rejected";

      await vendor.save();

      res.status(200).json({
        success: true,
        message:
          "Vendor rejected successfully",
      });
    } catch (error) {
      console.log(error);

      res.status(500).json({
        success: false,
        message:
          "Server Error",
      });
    }
  };



  // Dashboard Stats

export const getVendorStats =
  async (req, res) => {
    try {

      const totalVendors =
        await Vendor.countDocuments();

      const pendingVendors =
        await Vendor.countDocuments({
          status: "pending",
        });

      const approvedVendors =
        await Vendor.countDocuments({
          status: "approved",
        });

      const rejectedVendors =
        await Vendor.countDocuments({
          status: "rejected",
        });

      res.status(200).json({
        success: true,
        totalVendors,
        pendingVendors,
        approvedVendors,
        rejectedVendors,
      });

    } catch (error) {
      console.log(error);

      res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  };


  // Get All Vendors

export const getAllVendors =
  async (req, res) => {
    try {
      const vendors =
        await Vendor.find()
          .sort({
            createdAt: -1,
          });

      res.status(200).json({
        success: true,
        vendors,
      });
    } catch (error) {
      console.log(error);

      res.status(500).json({
        success: false,
        message:
          "Server Error",
      });
    }
  };


// Suspend Vendor

export const suspendVendor =
  async (req, res) => {
    try {
      const vendor =
        await Vendor.findById(
          req.params.id
        );

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message:
            "Vendor not found",
        });
      }

      vendor.accountStatus =
        "suspended";

      await vendor.save();

      res.status(200).json({
        success: true,
        message:
          "Vendor suspended successfully",
      });

    } catch (error) {
      console.log(error);

      res.status(500).json({
        success: false,
        message:
          "Server Error",
      });
    }
  };


// Activate Vendor

export const activateVendor =
  async (req, res) => {
    try {
      const vendor =
        await Vendor.findById(
          req.params.id
        );

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message:
            "Vendor not found",
        });
      }

      vendor.accountStatus =
        "active";

      await vendor.save();

      res.status(200).json({
        success: true,
        message:
          "Vendor activated successfully",
      });

    } catch (error) {
      console.log(error);

      res.status(500).json({
        success: false,
        message:
          "Server Error",
      });
    }
  };


// Hold Vendor

export const holdVendor =
  async (req, res) => {
    try {
      const vendor =
        await Vendor.findById(
          req.params.id
        );

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message:
            "Vendor not found",
        });
      }

      vendor.accountStatus =
        "hold";

      await vendor.save();

      res.status(200).json({
        success: true,
        message:
          "Vendor put on hold",
      });

    } catch (error) {
      console.log(error);

      res.status(500).json({
        success: false,
        message:
          "Server Error",
      });
    }
  };


// Deactivate Vendor

export const deactivateVendor =
  async (req, res) => {
    try {
      const vendor =
        await Vendor.findById(
          req.params.id
        );

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message:
            "Vendor not found",
        });
      }

      vendor.accountStatus =
        "deactivated";

      await vendor.save();

      res.status(200).json({
        success: true,
        message:
          "Vendor deactivated successfully",
      });

    } catch (error) {
      console.log(error);

      res.status(500).json({
        success: false,
        message:
          "Server Error",
      });
    }
  };



  // Assign vendor area

export const assignVendorArea =
  async (req, res) => {
    try {
      const { id } = req.params;
      const { assignedArea, assignedRadius } = req.body;

      const vendor =
        await Vendor.findById(id);

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found",
        });
      }

      vendor.assignedArea =
        assignedArea || vendor.assignedArea;
      if (assignedRadius !== undefined) {
        vendor.assignedRadius = assignedRadius;
      }

      await vendor.save();

      res.status(200).json({
        success: true,
        message:
          "Vendor area assigned successfully",
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  };

// Change Vendor Account Status

export const updateVendorAccountStatus =
  async (req, res) => {
    try {

      const { id } = req.params;
      const { accountStatus } = req.body;

      const vendor =
        await Vendor.findById(id);

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found",
        });
      }

      vendor.accountStatus = accountStatus;
      await vendor.save();

      await createVendorNotification({
        vendorId: vendor._id,
        title: accountStatus === "approved" ? "Account Approved 🎉" : "Account Status Update ℹ️",
        message: `Your vendor account status has been updated to "${accountStatus}".`,
        type: "GENERAL"
      });

      res.status(200).json({
        success: true,
        message: "Account status updated",
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
        message: "Server Error",
      });

    }
  };

// Get Vendor By ID
export const getVendorById = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }
    const permissions = await VendorPermission.findOne({ vendor: vendor._id });
    res.status(200).json({ success: true, vendor, permissions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Create Vendor from Admin Panel
export const createVendor = async (req, res) => {
  try {
    const {
      shopName,
      shopType,
      businessEmail,
      phone,
      password,
      ownerDetails,
      storeDetails,
      documents,
      latitude,
      longitude,
      deliveryRadius,
      serviceAreas,
    } = req.body;

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

    const vendorExists = await Vendor.findOne({
      $or: [{ businessEmail }, { phone }],
    });

    if (vendorExists) {
      return res.status(400).json({ success: false, message: "Vendor with email or phone already exists" });
    }

    const hashedPassword = await bcrypt.hash(password || "123456", 10);

    const vendor = await Vendor.create({
      shopName,
      shopType,
      businessEmail,
      phone,
      password: hashedPassword,
      status: "approved", // Auto-approved when created by admin
      accountStatus: "active",
      latitude: (latitude === undefined || latitude === null || latitude === "") ? null : Number(latitude),
      longitude: (longitude === undefined || longitude === null || longitude === "") ? null : Number(longitude),
      deliveryRadius: (deliveryRadius === undefined || deliveryRadius === null || deliveryRadius === "") ? null : Number(deliveryRadius),
      serviceAreas: serviceAreas || [],
      ownerDetails: {
        ownerName: ownerDetails?.ownerName || "",
        mobileNumber: ownerDetails?.mobileNumber || phone || "",
        email: ownerDetails?.email || businessEmail || "",
        profilePhoto: ownerDetails?.profilePhoto || "",
      },
      storeDetails: {
        storeName: storeDetails?.storeName || shopName || "",
        storeLogo: storeDetails?.storeLogo || "",
        storeAddress: storeDetails?.storeAddress || "",
        city: storeDetails?.city || "",
        state: storeDetails?.state || "",
        pincode: storeDetails?.pincode || "",
        serviceAreas: storeDetails?.serviceAreas || [],
        storeStatus: "open",
      },
      documents: {
        businessRegNo: documents?.businessRegNo || "",
        gstNumber: documents?.gstNumber || "",
        resellerCertificate: documents?.resellerCertificate || "",
        aadhaar: documents?.aadhaar || "",
        pan: documents?.pan || "",
        fssai: documents?.fssai || "",
        bankDetails: {
          accountHolder: documents?.bankDetails?.accountHolder || "",
          accountNumber: documents?.bankDetails?.accountNumber || "",
          ifsc: documents?.bankDetails?.ifsc || "",
          bankName: documents?.bankDetails?.bankName || "",
        },
      },
    });

    // Create default permissions
    await VendorPermission.create({
      vendor: vendor._id,
      permissions: {
        category: { view: true, add: true, edit: true, delete: true },
        subCategory: { view: true, add: true, edit: true, delete: true },
        productFamily: { view: true, add: true, edit: true, delete: true },
        areaAccess: { view: true },
        couponAccess: { view: true, create: true, edit: true, delete: true },
        product: { view: true, add: true, edit: true, delete: true },
      },
    });

    // Create default earnings and commission setup
    await VendorEarnings.create({ vendor: vendor._id });
    await Commission.create({ vendor: vendor._id, rate: 10 });

    res.status(201).json({ success: true, message: "Vendor created successfully", vendor });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// Update Vendor from Admin Panel
export const updateVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      shopName,
      shopType,
      businessEmail,
      phone,
      status,
      accountStatus,
      ownerDetails,
      storeDetails,
      documents,
      latitude,
      longitude,
      deliveryRadius,
      serviceAreas,
    } = req.body;

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

    const vendor = await Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }

    // Update root level fields
    if (shopName) vendor.shopName = shopName;
    if (shopType) vendor.shopType = shopType;
    if (businessEmail) vendor.businessEmail = businessEmail;
    if (phone) vendor.phone = phone;
    if (req.body.whatsapp !== undefined) vendor.whatsapp = req.body.whatsapp;
    if (status) vendor.status = status;
    if (accountStatus) vendor.accountStatus = accountStatus;

    if (latitude !== undefined) vendor.latitude = (latitude === null || latitude === "") ? null : Number(latitude);
    if (longitude !== undefined) vendor.longitude = (longitude === null || longitude === "") ? null : Number(longitude);
    if (deliveryRadius !== undefined) vendor.deliveryRadius = (deliveryRadius === null || deliveryRadius === "") ? null : Number(deliveryRadius);
    if (serviceAreas !== undefined) vendor.serviceAreas = serviceAreas;

    if (req.body.address) {
      vendor.address = {
        ...(vendor.address || {}),
        ...req.body.address
      };
    }



    // Update nested objects
    if (ownerDetails) {
      vendor.ownerDetails = {
        ownerName: ownerDetails.ownerName || vendor.ownerDetails?.ownerName || "",
        mobileNumber: ownerDetails.mobileNumber || vendor.ownerDetails?.mobileNumber || "",
        email: ownerDetails.email || vendor.ownerDetails?.email || "",
        profilePhoto: ownerDetails.profilePhoto || vendor.ownerDetails?.profilePhoto || "",
      };
    }

    if (storeDetails) {
      vendor.storeDetails = {
        storeName: storeDetails.storeName || shopName || vendor.storeDetails?.storeName || "",
        storeLogo: storeDetails.storeLogo || vendor.storeDetails?.storeLogo || "",
        storeAddress: storeDetails.storeAddress || vendor.storeDetails?.storeAddress || "",
        city: storeDetails.city || vendor.storeDetails?.city || "",
        state: storeDetails.state || vendor.storeDetails?.state || "",
        pincode: storeDetails.pincode || vendor.storeDetails?.pincode || "",
        serviceAreas: storeDetails.serviceAreas || vendor.storeDetails?.serviceAreas || [],
        storeStatus: storeDetails.storeStatus || vendor.storeDetails?.storeStatus || "open",
      };
    }

    if (documents) {
      vendor.documents = {
        businessRegNo: documents.businessRegNo || vendor.documents?.businessRegNo || "",
        gstNumber: documents.gstNumber || vendor.documents?.gstNumber || "",
        resellerCertificate: documents.resellerCertificate || vendor.documents?.resellerCertificate || "",
        aadhaar: documents.aadhaar || vendor.documents?.aadhaar || "",
        pan: documents.pan || vendor.documents?.pan || "",
        fssai: documents.fssai || vendor.documents?.fssai || "",
        bankDetails: {
          accountHolder: documents.bankDetails?.accountHolder || vendor.documents?.bankDetails?.accountHolder || "",
          accountNumber: documents.bankDetails?.accountNumber || vendor.documents?.bankDetails?.accountNumber || "",
          ifsc: documents.bankDetails?.ifsc || vendor.documents?.bankDetails?.ifsc || "",
          bankName: documents.bankDetails?.bankName || vendor.documents?.bankDetails?.bankName || "",
        },
      };
    }

    await vendor.save();
    res.status(200).json({ success: true, message: "Vendor updated successfully", vendor });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Delete Vendor
export const deleteVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findByIdAndDelete(id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }
    // Delete permissions, earnings, commission
    await VendorPermission.findOneAndDelete({ vendor: id });
    await VendorEarnings.findOneAndDelete({ vendor: id });
    await Commission.findOneAndDelete({ vendor: id });

    res.status(200).json({ success: true, message: "Vendor deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Vendor Permissions (Admin)
export const getVendorPermissions = async (req, res) => {
  try {
    const { id } = req.params;
    let permissions = await VendorPermission.findOne({ vendor: id });
    if (!permissions) {
      permissions = await VendorPermission.create({
        vendor: id,
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

// Update Vendor Permissions (Admin)
export const updateVendorPermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;

    const updatedPermissions = await VendorPermission.findOneAndUpdate(
      { vendor: id },
      { permissions, lastUpdatedBy: req.admin?._id },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: "Permissions updated successfully",
      permissions: updatedPermissions,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Vendor Service Area Location / Coordinates & Radius (Admin)
export const updateVendorServiceArea = async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, radiusKm } = req.body;

    // Validate inputs
    if (latitude === undefined || latitude === null || latitude === "") {
      return res.status(400).json({ success: false, message: "Latitude is required." });
    }
    const latNum = Number(latitude);
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      return res.status(400).json({ success: false, message: "Invalid latitude. Must be between -90 and 90." });
    }

    if (longitude === undefined || longitude === null || longitude === "") {
      return res.status(400).json({ success: false, message: "Longitude is required." });
    }
    const lngNum = Number(longitude);
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({ success: false, message: "Invalid longitude. Must be between -180 and 180." });
    }

    if (radiusKm === undefined || radiusKm === null || radiusKm === "") {
      return res.status(400).json({ success: false, message: "Radius is required." });
    }
    const radNum = Number(radiusKm);
    if (isNaN(radNum) || radNum <= 0) {
      return res.status(400).json({ success: false, message: "Radius must be a positive number greater than 0." });
    }

    const vendor = await Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found." });
    }

    vendor.latitude = latNum;
    vendor.longitude = lngNum;
    vendor.radiusKm = radNum;

    await vendor.save();

    res.status(200).json({
      success: true,
      message: "Vendor service area updated successfully.",
      vendor
    });
  } catch (error) {
    console.error("Update Vendor Service Area Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};