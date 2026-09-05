import { Product } from "../models/catalog.js";

const escapeHtml = (str) => {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const stripHtml = (html) => {
  if (!html) return "";
  return html.replace(/<[^>]*>?/gm, "").replace(/\s+/g, " ").trim();
};

export const handleProductSeo = async (req, res, next) => {
  const userAgent = req.headers["user-agent"] || "";
  const isCrawler = /facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|Pinterest|Slackbot|Discordbot|TelegramBot|Googlebot|bingbot|bot|crawler|spider|crawling/i.test(
    userAgent
  );

  // Extract parameter from route: /customer/product/:idOrSlug or /customer/product/slug/:slug
  const identifier = req.params.idOrSlug || req.params.slug || req.params[0];

  // If identifier is not present, pass to next middleware
  if (!identifier) {
    return next ? next() : res.status(404).send("Not Found");
  }

  // If this is a crawler request OR an HTML request to product page
  if (isCrawler || req.headers.accept?.includes("text/html")) {
    try {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(identifier);
      const query = isObjectId ? { $or: [{ _id: identifier }, { slug: identifier }] } : { slug: identifier };

      const product = await Product.findOne(query).lean();

      if (!product) {
        if (next) return next();
        return res.status(404).send("Product not found");
      }

      // Title
      const rawTitle = product.metaTitle || product.name || "Product Details";
      const title = escapeHtml(rawTitle.includes("Aryusha") ? rawTitle : `${rawTitle} | Aryusha`);

      // Description
      const rawDesc =
        product.metaDescription ||
        product.shortDescription ||
        product.description ||
        product.fullDescription ||
        `Buy ${product.name} online at best prices on Aryusha. Fast same-day grocery delivery.`;
      const cleanDesc = stripHtml(rawDesc);
      const truncatedDesc = cleanDesc.length > 160 ? `${cleanDesc.slice(0, 157)}...` : cleanDesc;
      const description = escapeHtml(truncatedDesc);

      // Image - ensure absolute URL
      let rawImage = product.ogImage || (product.images && product.images[0]) || "";
      let imageUrl = "https://aryusha.in/logo192.png"; // Fallback store logo

      if (rawImage) {
        if (rawImage.startsWith("http://") || rawImage.startsWith("https://")) {
          imageUrl = rawImage;
        } else {
          const host = req.get("host") || "aryusha.in";
          const protocol = req.protocol || "https";
          imageUrl = `${protocol}://${host}${rawImage.startsWith("/") ? "" : "/"}${rawImage}`;
        }
      }

      // Canonical URL
      const host = req.get("host") || "aryusha.in";
      const protocol = req.protocol || "https";
      const productSlug = product.slug || product._id;
      const canonicalUrl = `${protocol}://${host}/customer/product/${productSlug}`;

      const htmlResponse = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${canonicalUrl}" />

    <!-- Open Graph / Facebook / WhatsApp -->
    <meta property="og:type" content="product" />
    <meta property="og:site_name" content="Aryusha" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:secure_url" content="${imageUrl}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:url" content="${canonicalUrl}" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <meta name="twitter:url" content="${canonicalUrl}" />
  </head>
  <body>
    <div id="root">
      <h1>${title}</h1>
      <p>${description}</p>
      <img src="${imageUrl}" alt="${title}" />
    </div>
  </body>
</html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(htmlResponse);
    } catch (error) {
      console.error("Error generating product Open Graph meta tags:", error);
      if (next) return next();
      return res.status(500).send("Internal Server Error");
    }
  }

  // If not crawler or HTML accept, pass through
  if (next) return next();
  return res.status(404).send("Not Found");
};
