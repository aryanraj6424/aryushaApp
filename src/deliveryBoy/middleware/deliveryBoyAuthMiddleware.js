import jwt from "jsonwebtoken";
import DeliveryBoy from "../models/DeliveryBoy.js";

export const protectDeliveryBoy = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - No Token Provided",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const deliveryBoy = await DeliveryBoy.findById(decoded.id).select("-password");

    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery Boy Account Not Found",
      });
    }

    if (deliveryBoy.status !== "approved") {
      return res.status(403).json({
        success: false,
        message: `Access Denied - Account status is '${deliveryBoy.status}'`,
      });
    }

    if (deliveryBoy.accountStatus !== "active") {
      return res.status(403).json({
        success: false,
        message: `Access Denied - Account is ${deliveryBoy.accountStatus}`,
      });
    }

    req.deliveryBoy = deliveryBoy;
    next();
  } catch (error) {
    console.error("Delivery Boy Auth Error:", error);
    res.status(401).json({
      success: false,
      message: "Token Invalid or Expired",
    });
  }
};
