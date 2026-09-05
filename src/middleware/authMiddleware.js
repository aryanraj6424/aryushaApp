import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../customer/models/User.js";
import generateOtp from "../utils/generateOtp.js";
import generateToken from "../utils/generateToken.js";

const protect = async (
  req,
  res,
  next
) => {

  try {

    const token =
      req.headers.authorization
        ?.split(" ")[1];

    if (!token) {

      return res.status(401).json({
        message: "Unauthorized",
      });

    }

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    const user = await User.findById(
      decoded.id
    );

    if (!user) {
      return res.status(401).json({
        message: "User Account Not Found",
      });
    }

    req.user = user;

    next();

  } catch (error) {

    res.status(401).json({
      message: "Invalid Token",
    });

  }

};

export default protect;