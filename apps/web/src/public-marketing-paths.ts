const publicMarketingPaths = new Set([
  "/",
  "/features",
  "/pricing",
  "/restaurants",
  "/cafes",
  "/hotels",
  "/blog",
  "/contact",
  "/support",
  "/privacy",
  "/terms",
  "/restaurant-software",
  "/restaurant-qr",
  "/qr-menu",
  "/digital-menu",
  "/restaurant-ordering-system",
  "/table-ordering-system",
  "/qr-menu-india",
  "/restaurant-management-software",
  "/cafe-software",
  "/hotel-qr",
  "/upi-restaurant-ordering",
  "/dynamic-qr-menu",
  "/restaurant-software-bangalore",
  "/qr-menu-bangalore",
  "/one-qr",
  "/about",
]);

export function isPublicMarketingPath(path: string) {
  return publicMarketingPaths.has(path) || path.startsWith("/blog/");
}
