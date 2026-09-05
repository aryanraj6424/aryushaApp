import mongoose from "mongoose";

const adminSchema =
  new mongoose.Schema(
    {
      name: {
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

      otp: String,

      otpExpiry: Date,
    },
    {
      timestamps: true,
    }
  );

const Admin =
  mongoose.model(
    "Admin",
    adminSchema
  );

export default Admin;