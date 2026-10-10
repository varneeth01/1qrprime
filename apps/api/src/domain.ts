import { z } from "zod";
import { isIP } from "node:net";
export const categories = [
  "restaurant",
  "cafe",
  "cloud_kitchen",
  "retail",
  "salon",
  "clinic",
  "hotel",
  "professional_services",
  "generic",
] as const;
export const primeEligibleCategories = ["restaurant", "cafe", "hotel"] as const;
export function isPrimeEligibleCategory(category: string): boolean {
  return (primeEligibleCategories as readonly string[]).includes(category);
}
const restaurantCategories = ["restaurant", "cafe", "cloud_kitchen"];
export const templates = Object.fromEntries(
  categories.map((category) => [
    category,
    {
      category,
      orderEnabled: restaurantCategories.includes(category),
      requestEnabled: ["salon", "clinic", "hotel", "retail"].includes(category),
      catalogue: category !== "generic",
      suggestedActions:
        restaurantCategories.includes(category)
          ? ["Menu", "Pay", "Google Reviews", "WhatsApp", "Directions"]
          : ["WhatsApp", "Directions", "Google Reviews", "Website"],
    },
  ]),
);
export const CATEGORY_CAPABILITIES = {
  restaurant: { menu: true, ordering: true, tableQr: true, payments: true, reviews: true, socials: true, call: true, whatsapp: true, directions: true, website: true },
  cafe: { menu: true, ordering: true, tableQr: true, payments: true, reviews: true, socials: true, call: true, whatsapp: true, directions: true, website: true },
  cloud_kitchen: { menu: true, ordering: true, tableQr: false, payments: true, reviews: true, socials: true, call: true, whatsapp: true, directions: true, website: true },
  retail: { catalogue: true, ordering: false, tableQr: false, payments: true, reviews: true, socials: true, call: true, whatsapp: true, directions: true, website: true },
  salon: { services: true, booking: true, ordering: false, payments: true, reviews: true, socials: true, call: true, whatsapp: true, directions: true, website: true },
  clinic: { services: true, booking: true, ordering: false, payments: true, reviews: true, socials: true, call: true, whatsapp: true, directions: true, website: true },
  hotel: { menu: true, ordering: true, tableQr: true, payments: true, reviews: true, socials: true, call: true, whatsapp: true, directions: true, website: true },
  professional_services: { services: true, booking: true, ordering: false, payments: true, reviews: true, socials: true, call: true, whatsapp: true, directions: true, website: true },
  generic: { ordering: false, payments: true, reviews: true, socials: true, call: true, whatsapp: true, directions: true, website: true },
} as const;
export function safeLink(value: string) {
  try {
    const u = new URL(value);
    if (u.protocol === "tel:") return /^\+?[0-9 -]{7,18}$/.test(u.pathname);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      isIP(u.hostname) ||
      !u.hostname.includes(".") ||
      u.hostname.endsWith(".local") ||
      u.hostname === "localhost"
    )
      return false;
    return !/[\u0000-\u0020]/.test(value);
  } catch {
    return false;
  }
}
export const link = z
  .string()
  .max(2048)
  .refine(safeLink, "Use a public HTTPS URL or telephone link");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color");
export const appearanceSchema = z.object({
  themePreset: z.enum(["minimal", "midnight", "warm", "elegant", "bold", "custom"]).default("minimal"),
  layoutPreset: z.enum(["hero", "compact", "restaurant"]).default("restaurant"),
  primaryColor: hexColor.default("#174f43"),
  secondaryColor: hexColor.default("#deedaf"),
  backgroundColor: hexColor.default("#f6f7f4"),
  textColor: hexColor.default("#202f2c"),
  buttonColor: hexColor.default("#174f43"),
  buttonTextColor: hexColor.default("#ffffff"),
  logoUrl: link.nullable().default(null),
  coverUrl: link.nullable().default(null),
  actionOrder: z.array(z.string().min(1).max(40)).max(20).default([]),
  hiddenActions: z.array(z.string().min(1).max(40)).max(20).default([]),
});
export const profileSchema = z.object({
  description: z.string().max(800).default(""),
  address: z.string().max(300).default(""),
  hours: z.string().max(300).default(""),
  phone: z.string().max(20).default(""),
  actions: z
    .array(z.object({ label: z.string().min(1).max(50), url: link }))
    .max(12)
    .default([]),
  orderEnabled: z.boolean().default(false),
  requestEnabled: z.boolean().default(false),
  payAtCounter: z.boolean().default(true),
  orderTypes: z
    .array(z.enum(["dine_in", "takeaway", "delivery"]))
    .min(1)
    .default(["takeaway"]),
  orderingEnabled: z.boolean().optional(),
  manualClosed: z.boolean().default(false),
  showSoldOut: z.boolean().default(true),
  packagingFeePaise: z.number().int().min(0).max(100000).default(0),
  serviceFeePaise: z.number().int().min(0).max(100000).default(0),
  deliveryFeePaise: z.number().int().min(0).max(100000).default(0),
  taxBps: z.number().int().min(0).max(3000).default(0),
  minimumOrderPaise: z.number().int().min(0).max(10000000).default(0),
  estimatedPreparationMinutes: z.number().int().min(0).max(600).default(30),
  googleReviewUrl: link.nullable().default(null),
  instagramUrl: link.nullable().default(null),
  facebookUrl: link.nullable().default(null),
  youtubeUrl: link.nullable().default(null),
  xUrl: link.nullable().default(null),
  linkedinUrl: link.nullable().default(null),
  websiteUrl: link.nullable().default(null),
  directionsUrl: link.nullable().default(null),
  whatsappNumber: z.string().max(20).refine((value) => value === "" || /^\+?[0-9 ()-]{7,20}$/.test(value), "Use a valid WhatsApp number").default(""),
  appearance: appearanceSchema.default({} as any),
});
export const itemSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(400).default(""),
  section: z.string().min(1).max(60).default("Menu"),
  price_paise: z.number().int().min(0).max(10000000),
  available: z.boolean().default(true),
  image: link.nullable().optional(),
  categoryId: z.uuid().nullable().optional(),
  displayOrder: z.number().int().min(0).max(100000).default(0),
  discountedPricePaise: z.number().int().min(0).max(10000000).nullable().optional(),
  foodType: z.enum(["VEG", "NON_VEG", "EGG", "VEGAN", "OTHER"]).default("OTHER"),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  prepMinutes: z.number().int().min(0).max(600).default(0),
  taxBps: z.number().int().min(0).max(3000).default(0),
  stockStatus: z.enum(["AVAILABLE", "SOLD_OUT", "UNAVAILABLE"]).default("AVAILABLE"),
  featured: z.boolean().default(false),
  bestseller: z.boolean().default(false),
  spicy: z.boolean().default(false),
  recommended: z.boolean().default(false),
});
export const transitions: Record<string, string[]> = {
  submitted: ["accepted", "rejected", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  rejected: [],
  cancelled: [],
};
export interface PaymentProvider {
  id: string;
  capabilities: {
    deepLinks: boolean;
    paymentSessions: boolean;
    dynamicQr: boolean;
    statusQueries: boolean;
    refunds: boolean;
    webhooks: boolean;
  };
  create(input: {
    vpa: string;
    payee: string;
    amountPaise?: number;
    reference: string;
  }): { uri: string; state: "confirmation_pending" };
}
export const basicUpi: PaymentProvider = {
  id: "basic_upi",
  capabilities: {
    deepLinks: true,
    paymentSessions: false,
    dynamicQr: false,
    statusQueries: false,
    refunds: false,
    webhooks: false,
  },
  create({ vpa, payee, amountPaise, reference }) {
    const p = new URLSearchParams({
      pa: vpa,
      pn: payee,
      cu: "INR",
      tr: reference,
      tn: `1QR ${reference}`,
    });
    if (amountPaise !== undefined) p.set("am", (amountPaise / 100).toFixed(2));
    return { uri: `upi://pay?${p}`, state: "confirmation_pending" };
  },
};
export interface BillingProvider {
  id: "apple" | "google" | "web";
  verifyReceipt(receipt: string): Promise<{
    externalId: string;
    planId: string;
    state: "active" | "grace" | "expired";
    expiresAt: string;
  }>;
}
// No client receipt or redirect is trusted. Store adapters are intentionally disabled until configured and verified.
export const billingCapabilities = {
  purchaseEnabled: false,
  mode: "companion",
  providers: [],
};
