export type AppErrorCode =
  | "BUSINESS_NOT_FOUND"
  | "BUSINESS_NOT_READY"
  | "BUSINESS_ALREADY_PUBLISHED"
  | "PLAN_REQUIRED"
  | "PLAN_NOT_ACTIVE"
  | "PUBLISH_FORBIDDEN"
  | "PUBLIC_PAGE_NOT_FOUND"
  | "EMAIL_ALREADY_EXISTS"
  | "INVALID_CREDENTIALS"
  | "EMAIL_NOT_VERIFIED"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR"
  | "SLUG_TAKEN"
  | "PLAN_NOT_ELIGIBLE"
  | "STAFF_LIMIT_REACHED"
  | "PAYMENT_UNAVAILABLE"
  | "PAYMENT_CANCELLED"
  | "PAYMENT_FAILED"
  | "PAYMENT_VERIFICATION_FAILED"
  | "NETWORK_ERROR"
  | "RATE_LIMITED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "SERVER_ERROR";

export type AppErrorPayload = { code?: AppErrorCode; error?: string; message?: string; retryAfterSeconds?: number };

export function userFacingError(status: number, payload: AppErrorPayload = {}) {
  switch (payload.code) {
    case "BUSINESS_NOT_FOUND": return "We couldn't load this business.";
    case "BUSINESS_NOT_READY": return "Finish the remaining setup steps before publishing your business.";
    case "BUSINESS_ALREADY_PUBLISHED": return "Published";
    case "PLAN_REQUIRED": return "Choose and activate Prime before publishing your business.";
    case "PLAN_NOT_ACTIVE": return "Complete Prime checkout before publishing your business.";
    case "PUBLISH_FORBIDDEN": return "You don't have permission to publish this business.";
    case "PUBLIC_PAGE_NOT_FOUND": return "This business page isn't available.";
    case "EMAIL_ALREADY_EXISTS": return "An account with this email already exists.";
    case "INVALID_CREDENTIALS": return "Email or password is incorrect.";
    case "SESSION_EXPIRED": return "Your session has expired. Sign in again.";
    case "SLUG_TAKEN": return "That URL is already taken. Try another one.";
    case "PLAN_NOT_ELIGIBLE": return "Prime is currently available for restaurants, cafes and hotels.";
    case "STAFF_LIMIT_REACHED": return "Prime includes up to 5 staff accounts.";
    case "PAYMENT_UNAVAILABLE": return "Payments are temporarily unavailable. Please try again.";
    case "PAYMENT_CANCELLED": return "Payment wasn't completed. You can try again whenever you're ready.";
    case "PAYMENT_FAILED": return "We couldn't complete the payment. Prime hasn't been activated.";
    case "PAYMENT_VERIFICATION_FAILED": return "We couldn't verify this payment yet. If money was deducted, contact support and we'll check it.";
    case "RATE_LIMITED": return "Too many attempts. Please wait a moment and try again.";
    case "FORBIDDEN": return "You don't have access to this action.";
    case "NOT_FOUND": return "We couldn't find that resource.";
    case "VALIDATION_ERROR": return payload.message || "Check the highlighted fields and try again.";
    case "NETWORK_ERROR": return "Couldn't connect. Check your connection and try again.";
    case "SERVER_ERROR": return "Something went wrong. Please try again.";
  }
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "You don't have access to this action.";
  if (status === 404) return "We couldn't find that resource.";
  if (status === 429) return "Too many attempts. Please wait a moment and try again.";
  if (status >= 500) return "Something went wrong. Please try again.";
  return payload.message || payload.error || "Something went wrong. Please try again.";
}
