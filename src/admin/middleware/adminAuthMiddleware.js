import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";

export const protectAdmin =
  async (
    req,
    res,
    next
  ) => {
    try {
      const token =
        req.headers.authorization?.split(
          " "
        )[1];

      if (!token) {
        return res.status(401).json({
          success: false,
          message:
            "Not Authorized",
        });
      }

      const decoded =
        jwt.verify(
          token,
          process.env.JWT_SECRET
        );

      const admin = await Admin.findById(
        decoded.id
      ).select("-password");

      if (!admin) {
        return res.status(401).json({
          success: false,
          message: "Admin Account Not Found",
        });
      }

      req.admin = admin;

      next();
    } catch (error) {
      res.status(401).json({
        success: false,
        message:
          "Token Invalid",
      });
    }
  };