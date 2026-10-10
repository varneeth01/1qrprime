import test from "node:test";
import assert from "node:assert/strict";
import { canRenderMerchantNavigation, resolveProductState } from "../../../shared/product-state.js";

const base = (overrides: any = {}) => ({
  locations: [{ id: "l1", tenant_id: "t1", category: "restaurant", published: true, onboarding: { completed: true }, role: "owner" }],
  tenants: [{ id: "t1", billing_state: "active" }],
  ...overrides,
});

test("product state gates navigation until the account is ready", () => {
  assert.equal(resolveProductState(null), "UNAUTHENTICATED");
  assert.equal(resolveProductState({ locations: [], tenants: [] }), "AUTHENTICATED_ACCOUNT_SETUP");
  assert.equal(resolveProductState(base({ locations: [{ id: "l1", tenant_id: "t1", category: "restaurant", published: false, onboarding: { completed: false }, role: "owner" }] })), "AUTHENTICATED_ACCOUNT_SETUP");
  assert.equal(resolveProductState(base({ tenants: [{ id: "t1", billing_state: "free" }] })), "PRIME_PAYMENT_REQUIRED");
  assert.equal(resolveProductState(base()), "ACTIVE_MERCHANT");
  assert.equal(resolveProductState(base({ locations: [{ ...base().locations[0], role: "staff" }] })), "STAFF_ACTIVE");
  assert.equal(resolveProductState(base({ locations: [{ ...base().locations[0], category: "retail" }] })), "SALES_CONTACT_PENDING");
  assert.equal(canRenderMerchantNavigation("PRIME_PAYMENT_REQUIRED"), false);
  assert.equal(canRenderMerchantNavigation("SALES_CONTACT_PENDING"), false);
  assert.equal(canRenderMerchantNavigation("ACTIVE_MERCHANT"), true);
});
