# Product and release decisions

## Scanner-specific one-QR routing — pending validation

Scanner identity is not exposed to a normal HTTPS request. The release uses a stable customer-page QR and a separate UPI QR. `docs/qr-poc/matrix.csv` records the required PhonePe, Paytm, BHIM, Google Pay, Android camera, and iPhone camera tests. No scanner result is advertised until a real device, OS/app version, exact payload, and observed result are recorded.

## Billing — companion mode for first release

The mobile app contains no plan purchase screen or external purchase call-to-action. The server exposes plan state and entitlements. Apple permits free companion apps for paid web tools only under the applicable conditions, and its enterprise-services exception is limited to direct organization/group sales; individual merchant SaaS cannot be assumed exempt. Google Play offers India alternative billing programs, but eligibility, API reporting, and policy enrollment must be completed before enabling any paid digital subscription flow. Customer payments for real-world food/services remain separate.

## Payment verification — pending provider integration

Basic UPI deep links cannot prove that a payment settled. The product preserves truthful pending/unverified states and an audited merchant confirmation action. A provider adapter can be added when a licensed partner supplies session creation, signed callbacks, status queries, and credentials.
