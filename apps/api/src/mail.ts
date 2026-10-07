import nodemailer from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
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
        })
      : null;
  if (transport && fromEmail) {
    await transport.sendMail({
      from: process.env.SMTP_FROM_NAME
        ? `"${process.env.SMTP_FROM_NAME}" <${fromEmail}>`
        : fromEmail,
      to,
      subject,
      text,
    });
    return;
  }
  if (process.env.NODE_ENV === "production")
    throw Error("SMTP is not configured");
  await mkdir("./data/mail-preview", { recursive: true, mode: 0o700 });
  await writeFile(
    `./data/mail-preview/${randomUUID()}.txt`,
    `To: ${to}\nSubject: ${subject}\n\n${text}`,
    { mode: 0o600 },
  );
}
