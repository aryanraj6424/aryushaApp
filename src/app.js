
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import locationRoutes from "./customer/routes/locationRoutes.js";
import authRoutes from "./customer/routes/authRoutes.js";
import addressRoutes from "./customer/routes/addressRoutes.js";
import vendorAuthRoutes from "./vendor/routes/vendorAuthRoutes.js";
import vendorRoutes from "./vendor/routes/vendorRoutes.js";
import vendorProductRoutes from "./vendor/routes/vendorProductRoutes.js";
import vendorProductsRoutes from "./vendor/routes/vendorProductsRoutes.js";
//admin
import adminAuthRoutes from "./admin/routes/adminAuthRoutes.js";
import adminVendorRoutes from "./admin/routes/vendorRoutes.js";
import productRoutes from "./admin/routes/productRoutes.js";
import attributeRoutes from "./admin/routes/attributeRoutes.js";
import feeSettingsRoutes from "./admin/routes/feeSettingsRoutes.js";
import couponRoutes from "./admin/routes/couponRoutes.js";
import adminOrderRoutes from "./admin/routes/orderRoutes.js";
import adminFeeRoutes from "./admin/routes/feeRoutes.js";
import customerFeeRoutes from "./customer/routes/feeRoutes.js";
import adminDeliveryRoutes from "./admin/routes/adminDeliveryRoutes.js";
import adminCustomerRoutes from "./admin/routes/adminCustomerRoutes.js";
import bannerRoutes from "./admin/routes/bannerRoutes.js";
import adminFinanceRoutes from "./admin/routes/adminFinanceRoutes.js";
import staticPageRoutes from "./admin/routes/staticPageRoutes.js";
import vendorFinanceRoutes from "./vendor/routes/vendorFinanceRoutes.js";
import vendorCustomerRoutes from "./vendor/routes/vendorCustomerRoutes.js";
import vendorNotificationRoutes from "./vendor/routes/vendorNotificationRoutes.js";
import adminNotificationRoutes from "./admin/routes/adminNotificationRoutes.js";
import adminSearchRoutes from "./admin/routes/adminSearchRoutes.js";
import adminAnalyticsRoutes from "./admin/routes/adminAnalyticsRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import catalogRoutes from "./routes/catalogRoutes.js";
import brandRoutes from "./routes/brandRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import customerOrderRoutes from "./customer/routes/orderRoutes.js";
import customerCartRoutes from "./customer/routes/cartRoutes.js";
import customerWishlistRoutes from "./customer/routes/wishlistRoutes.js";
import deliveryBoyAuthRoutes from "./deliveryBoy/routes/deliveryBoyAuthRoutes.js";
import deliveryBoyRoutes from "./deliveryBoy/routes/deliveryBoyRoutes.js";
import sitemapRoutes from "./routes/sitemapRoutes.js";
const app = express();

/*
|--------------------------------------------------------------------------
| Middleware
|--------------------------------------------------------------------------
*/

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow any localhost/127.0.0.1 (http/https) or local network IP origins
      if (
        !origin ||
        origin.startsWith("http://localhost") ||
        origin.startsWith("https://localhost") ||
        origin.startsWith("http://127.0.0.1") ||
        origin.startsWith("https://127.0.0.1") ||
        /^https?:\/\/(10|192\.168|172\.(1[6-9]|2[0-9]|3[01]))\.\d+\.\d+(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

app.use(cookieParser());

/*
|--------------------------------------------------------------------------
| Test Route
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Aryusha Backend Running 🚀",
  });
});

/*
|--------------------------------------------------------------------------
| Auth Routes
|--------------------------------------------------------------------------
*/

app.use("/api/auth", authRoutes);

//vender routes

app.use(
  "/api/vendor/auth",
  vendorAuthRoutes
);

app.use(
  "/api/vendor",
  vendorRoutes
);

app.use(
  "/api/vendor/product",
  vendorProductRoutes
);

app.use(
  "/api/vendor/products",
  vendorProductsRoutes
);

app.use("/api/vendor/finance", vendorFinanceRoutes);
app.use("/api/vendor/customers", vendorCustomerRoutes);
app.use("/api/vendor/notifications", vendorNotificationRoutes);
app.use("/api/admin/notifications", adminNotificationRoutes);
app.use("/api/admin/search", adminSearchRoutes);
app.use("/api/admin/analytics", adminAnalyticsRoutes);


//admin route
app.use(
  "/api/admin/auth",
  adminAuthRoutes
);

app.use("/api/admin/finance", adminFinanceRoutes);

// addressRoutes

app.use(
  "/api/address",
  addressRoutes
);

app.use(
  "/api/admin/vendors",
  adminVendorRoutes
);

app.use(
  "/api/admin/fee-settings",
  feeSettingsRoutes
);

app.use(
  "/api/admin/coupons",
  couponRoutes
);

app.use(
  "/api/admin/fees",
  adminFeeRoutes
);

app.use(
  "/api/fees",
  customerFeeRoutes
);

// product and attribute routes
app.use(
  "/api/admin/product",
  productRoutes
);
app.use(
  "/api/admin/products",
  productRoutes
);

app.use(
  "/api/admin/attribute",
  attributeRoutes
);

import unitRoutes from "./admin/routes/unitRoutes.js";
app.use("/api/admin/unit", unitRoutes);
app.use("/api/admin/units", unitRoutes);

app.use("/api/categories", categoryRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/customer/orders", customerOrderRoutes);
app.use("/api/customer/cart", customerCartRoutes);
app.use("/api/customer/wishlist", customerWishlistRoutes);

// Delivery Boy Routes
app.use("/api/delivery-boy/auth", deliveryBoyAuthRoutes);
app.use("/api/delivery-boy", deliveryBoyRoutes);

// Admin Customers & Banners
app.use("/api/admin/customers", adminCustomerRoutes);
app.use("/api/admin/banners", bannerRoutes);
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/admin", adminDeliveryRoutes);
app.use("/api/footer", staticPageRoutes);

// location api
app.use("/api/location", locationRoutes);

// Catalog Routes (mounted at the bottom to prevent intercepting other /api routes)
app.use("/api", catalogRoutes);

// Sitemap & SEO Routes
import { handleProductSeo } from "./middleware/productSeoMiddleware.js";
app.get("/customer/product/slug/:slug", handleProductSeo);
app.get("/customer/product/:idOrSlug", handleProductSeo);
app.use("/", sitemapRoutes);



/*
|--------------------------------------------------------------------------
| 404 Route
|--------------------------------------------------------------------------
*/
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route Not Found",
  });
});

export default app;