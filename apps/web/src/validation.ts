export { normalizeSlug as normalizeSlugSuggestion } from "../../../shared/slug";
import { normalizeSlug, RESERVED_SLUGS, slugFormatMessage } from "../../../shared/slug";

export function slugFormatError(value: string) {
  const normalized = normalizeSlug(value);
  if (value.length > 60 && normalized.length >= 60) return "Keep your business URL under 60 characters.";
  if (RESERVED_SLUGS.has(normalized)) return "That URL isn't available. Try a different one.";
  return slugFormatMessage(value);
}

export function emailFormatError(value: string) {
  if (!value.trim()) return "Enter your email address.";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
    ? ""
    : "Enter a valid email address.";
}

export function passwordFormatError(value: string) {
  if (!value) return "Enter your password.";
  return value.length >= 12 ? "" : "Use at least 12 characters.";
}
