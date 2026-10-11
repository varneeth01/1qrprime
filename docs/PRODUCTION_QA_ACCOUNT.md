# Production internal QA account

The production QA workspace is an explicit, server-provisioned exception for authenticated UI and route acceptance. It is not a payment bypass and does not create a Razorpay payment.

## Provisioning

Run only against the production PostgreSQL environment, after migrations have been applied, with the following variables supplied through the server/Coolify secret environment. Never commit them or place them in frontend/mobile variables:

- `NODE_ENV=production`
- `DATABASE_DRIVER=postgres`
- `ALLOW_PRODUCTION_QA_PROVISIONING=true`
- `PROD_QA_PROVISION_CONFIRM=OLIVE_AND_EMBER_QA`
- `PROD_QA_OWNER_EMAIL` / `PROD_QA_OWNER_PASSWORD`
- `PROD_QA_MANAGER_EMAIL` / `PROD_QA_MANAGER_PASSWORD`
- `PROD_QA_STAFF_EMAIL` / `PROD_QA_STAFF_PASSWORD`

Then run `npm run qa:provision:production` once from the controlled server environment. The command accepts no tenant or user IDs, refuses non-production or non-PostgreSQL databases, refuses to modify an owner’s non-QA tenant, is idempotent, and prints no passwords.

The provisioned workspace is `Olive & Ember QA` at `olive-and-ember-qa`. Its owner has `users.account_type=internal_qa`; its tenant has `billing_state=active` and `billing_source=internal_qa`. Both conditions are required by product-state logic. The command records an immutable `qa.internal_provisioned` audit event.

Normal signup, plan selection, Razorpay order creation, Razorpay signature verification, and payment activation are unchanged for standard accounts. The QA marker cannot be set through merchant request bodies.

## Reset / cleanup

There is no broad reset command. Remove or rotate only this dedicated QA workspace through an explicitly reviewed operational procedure. Never run a fixture cleanup against production.
