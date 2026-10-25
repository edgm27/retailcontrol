import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "./logger";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  /** Enlace de acción (solo se usa en el buzón de desarrollo). */
  actionUrl?: string;
}

/**
 * Transporte de correo intercambiable.
 * - "dev-file": escribe el mensaje en DEV_MAILBOX_DIR (desarrollo y E2E). Está
 *   bloqueado en producción salvo ALLOW_DEV_MAILBOX=1 (solo entornos de prueba).
 * - "smtp": usa SMTP_URL mediante nodemailer.
 */
export async function sendEmail(msg: OutgoingEmail): Promise<void> {
  const transport = process.env.EMAIL_TRANSPORT ?? "dev-file";
  if (transport === "dev-file") {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_MAILBOX !== "1") {
      throw new Error("EMAIL_TRANSPORT=dev-file no está permitido en producción.");
    }
    const dir = path.resolve(process.env.DEV_MAILBOX_DIR ?? ".dev-mailbox");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${msg.to.replace(/[^a-z0-9@._-]/gi, "_")}.json`);
    await writeFile(file, JSON.stringify({ ...msg, sentAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
    logger.info({ to: msg.to, subject: msg.subject }, "correo de desarrollo escrito en el buzón local");
    return;
  }
  if (transport === "smtp") {
    const nodemailer = await import("nodemailer");
    const smtp = process.env.SMTP_URL;
    if (!smtp) throw new Error("Falta SMTP_URL.");
    const t = nodemailer.createTransport(smtp);
    await t.sendMail({ from: process.env.EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text });
    logger.info({ subject: msg.subject }, "correo enviado por SMTP");
    return;
  }
  throw new Error(`EMAIL_TRANSPORT desconocido: ${transport}`);
}
