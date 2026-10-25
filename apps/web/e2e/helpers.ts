import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { generateSync } from "otplib";
import { MAILBOX_DIR } from "../playwright.config";

export function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;
}

async function readMagicLink(email: string, notBefore: number): Promise<string> {
  const file = path.join(MAILBOX_DIR, `${email}.json`);
  for (let i = 0; i < 50; i++) {
    try {
      const msg = JSON.parse(await readFile(file, "utf8")) as { actionUrl: string; sentAt: string };
      if (new Date(msg.sentAt).getTime() >= notBefore) return msg.actionUrl;
    } catch {
      /* aún no existe */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`No llegó el correo para ${email}`);
}

/** Login completo con enlace mágico leído del buzón de desarrollo. */
export async function loginWithMagicLink(page: Page, email: string) {
  await rm(path.join(MAILBOX_DIR, `${email}.json`), { force: true });
  const t0 = Date.now() - 1000;
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Enviar enlace de acceso" }).click();
  await expect(page.getByRole("heading", { name: "Revise su correo" })).toBeVisible();
  await page.goto(await readMagicLink(email, t0));
}

let lastStep = -1;
/** Código TOTP de un paso de tiempo aún no usado (espera al siguiente paso si hace falta). */
export async function freshTotp(secret: string): Promise<string> {
  let step = Math.floor(Date.now() / 30_000);
  while (step <= lastStep) {
    await new Promise((r) => setTimeout(r, 1000));
    step = Math.floor(Date.now() / 30_000);
  }
  lastStep = step;
  return generateSync({ secret });
}
