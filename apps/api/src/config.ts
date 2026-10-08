import { z } from "zod";
export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "staging", "production"])
    .default("development"),
  PORT: z.coerce.number().default(3001),
  DATABASE_DRIVER: z.enum(["sqlite", "postgres"]).default("sqlite"),
  DATABASE_PATH: z.string().default("./data/prime.sqlite"),
  MEDIA_ROOT: z.string().default("./data/uploads"),
  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),
  PUBLIC_ORIGIN: z.string().url().default("http://localhost:5173"),
  API_PUBLIC_ORIGIN: z.string().url().optional(),
  ADMIN_ORIGIN: z.string().url().default("http://localhost:5173"),
  STORAGE_DRIVER: z.enum(["local", "s3", "vercel-blob"]).default("local"),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_ORIGIN: z.string().url().optional(),
  SMTP_URL: z.string().url().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM_NAME: z.string().default("1QR Prime"),
  SMTP_FROM_EMAIL: z.string().email().optional(),
  AWS_REGION: z.string().default("ap-south-1"),
  SUPPORT_EMAIL: z.string().email().optional(),
});
export type Config = z.infer<typeof envSchema>;
export function config() {
  const c = envSchema.parse(
    Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== "")),
  );
  if (
    c.NODE_ENV === "production" &&
    (!c.PUBLIC_ORIGIN.startsWith("https://") ||
      !c.API_PUBLIC_ORIGIN?.startsWith("https://") ||
      !c.ADMIN_ORIGIN.startsWith("https://") ||
      !c.SUPPORT_EMAIL ||
      !c.DATABASE_URL ||
      !c.SESSION_SECRET ||
      c.SESSION_SECRET.length < 32)
  )
    throw Error("Production requires HTTPS origins, SUPPORT_EMAIL, DATABASE_URL, and a production-safe SESSION_SECRET");
  if (c.NODE_ENV === "production" && /trycloudflare\.com|localhost|127\.\d+\.\d+\.\d+|10\.0\.2\.2/i.test(`${c.PUBLIC_ORIGIN} ${c.API_PUBLIC_ORIGIN} ${c.ADMIN_ORIGIN}`))
    throw Error("Production origins cannot use preview, loopback, or emulator hosts");
  if (
    c.NODE_ENV === "production" &&
    c.STORAGE_DRIVER === "local" &&
    !c.MEDIA_ROOT.startsWith("/")
  )
    throw Error("Production local storage requires an absolute MEDIA_ROOT");
  if (c.NODE_ENV === "production" && c.STORAGE_DRIVER === "vercel-blob" && !c.BLOB_READ_WRITE_TOKEN)
    throw Error("Vercel Blob storage requires BLOB_READ_WRITE_TOKEN");
  if (c.NODE_ENV === "production" && c.DATABASE_DRIVER !== "postgres")
    throw Error("Production requires DATABASE_DRIVER=postgres");
  if (c.STORAGE_DRIVER === "s3" && (!c.S3_BUCKET || !c.S3_PUBLIC_ORIGIN))
    throw Error("S3 storage requires S3_BUCKET and S3_PUBLIC_ORIGIN");
  if (
    c.NODE_ENV === "production" &&
    ((!c.SMTP_URL && !c.SMTP_HOST) || !c.SMTP_FROM_EMAIL)
  )
    throw Error("Production requires SMTP_URL or SMTP_HOST plus SMTP_FROM_EMAIL for account recovery");
  return c;
}
