# Local test accounts

## Local merchant QA

- Email: `qa.owner@1qrprime.local`
- Password: stored in ignored `.env.qa.local`
- State: `ACTIVE_OWNER`
- Business: `Olive & Ember`
- Purpose: authenticated merchant UI/UX testing only

This fixture and its credentials are local/QA-only. They must never be enabled
in production. The seed command refuses to run with `NODE_ENV=production`, and
the local fixture uses an explicit `internal_qa` source and account marker; production provisioning is a separate guarded operation documented in `docs/PRODUCTION_QA_ACCOUNT.md`.
