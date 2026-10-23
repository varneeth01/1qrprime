# 1QR Prime media storage

Local development may use `STORAGE_DRIVER=local` with `MEDIA_ROOT=./data/uploads`.
Uploaded images are normalized to WebP and served through the existing media
route for local testing.

Production must use durable object storage:

```text
STORAGE_DRIVER=s3
AWS_REGION=ap-south-1
S3_ENDPOINT=<optional S3-compatible endpoint>
S3_BUCKET=<bucket>
S3_PUBLIC_ORIGIN=https://<public-media-origin>
S3_ACCESS_KEY_ID=<server-side secret>
S3_SECRET_ACCESS_KEY=<server-side secret>
```

`S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` are API-runtime values only. They
must be injected through the deployment secret manager and never appear in web,
mobile, or committed environment files.

The API generates tenant-scoped immutable object keys. Uploading a replacement
completes the new upload and item-reference update before any cleanup decision;
a failed replacement therefore cannot remove the existing image reference.
Object cleanup is intentionally conservative: an old object may remain until
an approved garbage-collection process removes it. Menu data correctness takes
precedence over eager deletion.

The production Compose file requires `S3_BUCKET` and `S3_PUBLIC_ORIGIN` and
defaults `STORAGE_DRIVER` to `s3`. It will fail during startup rather than
silently falling back to `/data/media`.
