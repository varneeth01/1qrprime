import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { isPromotionActive } from "../src/promotion-window.js";
import { MetaWhatsAppCloudProvider } from "../src/whatsapp.js";

test("recurring promotion windows honor timezone and weekly days", () => {
  const promotion = {
    start_at: "2026-01-01T00:00:00.000Z",
    end_at: "2026-12-31T23:59:59.000Z",
    recurrence_json: JSON.stringify({ frequency: "weekly", daysOfWeek: [1], startTime: "09:00", endTime: "12:00", timezone: "Asia/Kolkata" }),
  };
  assert.equal(isPromotionActive(promotion, new Date("2026-03-02T05:00:00.000Z")), true); // Monday, 10:30 IST
  assert.equal(isPromotionActive(promotion, new Date("2026-03-02T08:00:00.000Z")), false); // Monday, 13:30 IST
  assert.equal(isPromotionActive(promotion, new Date("2026-03-03T05:00:00.000Z")), false); // Tuesday
});

test("Meta webhook signatures are verified against the raw body", () => {
  const raw = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: "wamid.test", status: "delivered" }] } }] }] });
  const provider = new MetaWhatsAppCloudProvider({ accessToken: "test", phoneNumberId: "phone", businessAccountId: "business", appSecret: "app-secret" });
  const signature = `sha256=${createHmac("sha256", "app-secret").update(raw).digest("hex")}`;
  assert.equal(provider.verifyWebhook(raw, signature), true);
  assert.equal(provider.verifyWebhook(`${raw} `, signature), false);
  assert.deepEqual(provider.normalizeWebhook(JSON.parse(raw)).map(({ providerMessageId, status }) => ({ providerMessageId, status })), [{ providerMessageId: "wamid.test", status: "delivered" }]);
});
