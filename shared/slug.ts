export const MAX_SLUG_LENGTH = 60;
export const MIN_SLUG_LENGTH = 3;
export const SLUG_AVAILABILITY_PATH = "/locations/slug-availability";

export const RESERVED_SLUGS = new Set([
  "api", "admin", "login", "signup", "register", "settings", "account",
  "support", "privacy", "terms", "q", "b", "staff", "payments", "orders",
  "menu", "assets", "recovery", "reset", "verify",
]);

export function normalizeSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function slugFormatMessage(value: string) {
  const slug = normalizeSlug(value);
  if (!slug) return "Enter a business name to create your URL.";
  if (slug.length < MIN_SLUG_LENGTH) return `Your business URL needs at least ${MIN_SLUG_LENGTH} characters.`;
  if (slug.length > MAX_SLUG_LENGTH) return `Keep your business URL under ${MAX_SLUG_LENGTH} characters.`;
  if (RESERVED_SLUGS.has(slug)) return "That URL isn't available. Try a different one.";
  return "";
}
