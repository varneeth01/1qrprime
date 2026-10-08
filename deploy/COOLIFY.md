# 1QR Prime on Coolify

Deploy this branch with **Docker Compose** using `coolify.compose.yml`.

## Services and domains

- `web:80` → `https://1qrprime.com`
- `web:80` → `https://www.1qrprime.com` (Nginx redirects to apex)
- `web:80` → `https://admin.1qrprime.com`
- `api:3000` → `https://api.1qrprime.com`

## Required environment variables

Set these in Coolify; never commit their values:

- `DATABASE_URL` — Neon pooled connection string
- `DIRECT_URL` — Neon direct/non-pooled connection string (recommended for migrations)
- `SESSION_SECRET` — at least 32 random characters
- `SUPPORT_EMAIL`
- `SMTP_PASSWORD` — Resend SMTP credential
- `SMTP_FROM_EMAIL` — verified sender, e.g. `noreply@1qrprime.com`

Optional overrides:

- `SMTP_HOST=smtp.resend.com`
- `SMTP_PORT=465`
- `SMTP_SECURE=true`
- `SMTP_USER=resend`
- `SMTP_FROM_NAME=1QR Prime`
- `PG_POOL_MAX=10`

## Deployment behavior

The API container runs PostgreSQL migrations before starting Fastify. Migrations are idempotent.
Merchant-uploaded images are stored in the persistent Docker volume `prime-media`.

## Acceptance checks

After DNS and TLS are live:

```bash
curl -fsS https://api.1qrprime.com/api/health
curl -fsS https://api.1qrprime.com/api/ready
curl -I https://1qrprime.com/
curl -I https://admin.1qrprime.com/
```

Then test register, login, `/api/me`, QR customer page, order creation, payment handoff, image upload, and account recovery.
