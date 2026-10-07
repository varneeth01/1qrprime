import QRCode from "qrcode";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
const origin = process.env.PUBLIC_ORIGIN || "http://localhost:5173",
  slug = process.env.QR_SLUG || "scanner-test";
// A test VPA is never silently substituted for a real merchant destination.
const vpa = process.env.TEST_MERCHANT_VPA;
const cases = [
  {
    id: "https-page",
    payload: `${origin}/b/${slug}?source=qr`,
    purpose: "Stable customer page. Real-device scans NOT TESTED.",
  },
];
if (vpa)
  cases.push({
    id: "upi-payment",
    payload: `upi://pay?${new URLSearchParams({ pa: vpa, pn: process.env.TEST_PAYEE || "Scanner test", cu: "INR", tr: "QRPOC001", tn: "Scanner compatibility test" })}`,
    purpose:
      "Separate payment QR. Never authorise payment as part of a scan-only test.",
  });
await mkdir("docs/qr-poc/assets", { recursive: true });
for (const c of cases) {
  await writeFile(
    `docs/qr-poc/assets/${c.id}.svg`,
    await QRCode.toString(c.payload, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 4,
      width: 1200,
    }),
  );
  await QRCode.toFile(`docs/qr-poc/assets/${c.id}.png`, c.payload, {
    width: 1200,
    errorCorrectionLevel: "H",
    margin: 4,
  });
}
const recorded = cases.map(({ payload, ...c }) => ({
  ...c,
  payload,
  sha256: createHash("sha256").update(payload).digest("hex"),
}));
await writeFile(
  "docs/qr-poc/payloads.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      status: "NOT_DEVICE_VERIFIED",
      cases: recorded,
    },
    null,
    2,
  ),
);
console.log(
  `Generated ${cases.length} exact-payload test assets. Device verification is still required.`,
);
