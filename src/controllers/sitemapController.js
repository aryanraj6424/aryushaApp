import { Category, Product } from "../models/catalog.js";

let cachedXml = null;
let lastCacheTime = 0;
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

export const getSitemapXml = async (req, res) => {
  try {
    const now = Date.now();
    if (cachedXml && now - lastCacheTime < CACHE_DURATION_MS) {
      res.header("Content-Type", "application/xml");
      return res.status(200).send(cachedXml);
    }

    const domain = "https://aryusha.in";
    const staticRoutes = [
      { url: "/", priority: "1.0", changefreq: "daily" },
      { url: "/customer/dashboard", priority: "0.9", changefreq: "daily" },
      { url: "/customer/categories", priority: "0.8", changefreq: "weekly" },
      { url: "/customer/support", priority: "0.5", changefreq: "monthly" },
      { url: "/customer/page/about-us", priority: "0.5", changefreq: "monthly" },
      { url: "/customer/page/terms", priority: "0.3", changefreq: "monthly" },
      { url: "/customer/page/privacy-policy", priority: "0.3", changefreq: "monthly" },
    ];

    let categories = [];
    let products = [];

    try {
      categories = await Category.find({ status: "active", isDeleted: false }).select("_id updatedAt slug").lean();
      products = await Product.find({ status: "active", isDeleted: false }).select("_id slug updatedAt").lean();
    } catch (dbErr) {
      console.error("Sitemap DB Query Notice:", dbErr.message);
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Static pages
    staticRoutes.forEach((route) => {
      xml += `  <url>\n`;
      xml += `    <loc>${domain}${route.url}</loc>\n`;
      xml += `    <changefreq>${route.changefreq}</changefreq>\n`;
      xml += `    <priority>${route.priority}</priority>\n`;
      xml += `  </url>\n`;
    });

    // Category pages
    categories.forEach((cat) => {
      const lastMod = cat.updatedAt ? new Date(cat.updatedAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
      xml += `  <url>\n`;
      xml += `    <loc>${domain}/customer/dashboard?category=${cat._id}</loc>\n`;
      xml += `    <lastmod>${lastMod}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.8</priority>\n`;
      xml += `  </url>\n`;
    });

    // Product pages
    products.forEach((prod) => {
      const lastMod = prod.updatedAt ? new Date(prod.updatedAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
      const productSlug = prod.slug || prod._id;
      xml += `  <url>\n`;
      xml += `    <loc>${domain}/customer/product/${productSlug}</loc>\n`;
      xml += `    <lastmod>${lastMod}</lastmod>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    });

    xml += `</urlset>`;

    cachedXml = xml;
    lastCacheTime = now;

    res.header("Content-Type", "application/xml");
    return res.status(200).send(xml);
  } catch (err) {
    console.error("Error generating sitemap:", err);
    return res.status(500).send("Error generating sitemap XML");
  }
};
