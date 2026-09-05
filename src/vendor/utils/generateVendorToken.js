import jwt from "jsonwebtoken";

export const generateVendorToken = (
  vendorId
) => {
  return jwt.sign(
    { id: vendorId, role: "vendor" },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
};