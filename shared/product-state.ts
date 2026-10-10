export type ProductState =
  | "UNAUTHENTICATED"
  | "AUTHENTICATED_ACCOUNT_SETUP"
  | "PRIME_PAYMENT_REQUIRED"
  | "SALES_CONTACT_PENDING"
  | "ACTIVE_MERCHANT"
  | "STAFF_ACTIVE"
  | "ADMIN";

export function resolveProductState(me: any): ProductState {
  if (!me) return "UNAUTHENTICATED";
  if (me.adminRole) return "ADMIN";
  if (!me.locations?.length) return "AUTHENTICATED_ACCOUNT_SETUP";
  const location = me.locations.find((item: any) => item.id === me.activeLocationId) || me.locations[0];
  if (!location?.onboarding?.completed && !location?.published) return "AUTHENTICATED_ACCOUNT_SETUP";
  const tenant = me.tenants?.find((item: any) => item.id === location.tenant_id) || me.tenants?.[0];
  if (location.role && location.role !== "owner") return "STAFF_ACTIVE";
  if (!["restaurant", "cafe", "hotel"].includes(location.category)) return "SALES_CONTACT_PENDING";
  if (tenant?.billing_state !== "active") return "PRIME_PAYMENT_REQUIRED";
  return "ACTIVE_MERCHANT";
}

export function canRenderMerchantNavigation(state: ProductState) {
  return ["ACTIVE_MERCHANT", "STAFF_ACTIVE", "ADMIN"].includes(state);
}
