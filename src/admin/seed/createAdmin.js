import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

import Admin from "../models/Admin.js";

dotenv.config();

const createAdmin = async () => {
  try {
    await mongoose.connect(
      process.env.MONGO_URI
    );

    const existingAdmin =
      await Admin.findOne({
        phone: "9999999999",
      });

    if (existingAdmin) {
      console.log(
        "Admin already exists"
      );

      process.exit();
    }

    const hashedPassword =
      await bcrypt.hash(
        "Akshu11@",
        10
      );

    const admin =
      await Admin.create({
        name: "Super Admin",
        phone: "9999999999",
        password:
          hashedPassword,
      });

    console.log(
      "Admin Created Successfully"
    );

    console.log(admin);

    process.exit();
  } catch (error) {
    console.log(error);

    process.exit(1);
  }
};

createAdmin();