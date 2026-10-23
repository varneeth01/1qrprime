import nodemailer from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export async function sendMail(to: string, subject: string, text: string) {
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.MAIL_FROM;
  const transport = process.env.SMTP_URL
    ? nodemailer.createTransport(process.env.SMTP_URL)
    : process.env.SMTP_HOST
      ? nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_SECURE === "true",
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
            : undefined,
          connectionTimeout: positiveInt(process.env.SMTP_CONNECTION_TIMEOUT_MS, 10_000),
          greetingTimeout: positiveInt(process.env.SMTP_GREETING_TIMEOUT_MS, 10_000),
          socketTimeout: positiveInt(process.env.SMTP_SOCKET_TIMEOUT_MS, 20_000),
        })
      : null;

  if (transport && fromEmail) {
    try {
      await transport.sendMail({
        from: process.env.SMTP_FROM_NAME
          ? `"${process.env.SMTP_FROM_NAME}" <${fromEmail}>`
          : fromEmail,
        to,
        subject,
        text,
      });
      return;
    } catch (error) {
      const providerCode =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code)
          : "UNKNOWN";
      throw Object.assign(new Error("Transactional email delivery failed"), {
        code: "EMAIL_DELIVERY_FAILED",
        providerCode,
        cause: error,
      });
    }
  }

  if (process.env.NODE_ENV === "production")
    throw Object.assign(new Error("SMTP is not configured"), {
      code: "EMAIL_DELIVERY_FAILED",
      providerCode: "SMTP_NOT_CONFIGURED",
    });

  await mkdir("./data/mail-preview", { recursive: true, mode: 0o700 });
  await writeFile(
    `./data/mail-preview/${randomUUID()}.txt`,
    `To: ${to}\nSubject: ${subject}\n\n${text}`,
    { mode: 0o600 },
  );
}
