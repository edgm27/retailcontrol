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
  await page.getByText("¿Sin contraseña u olvidó la suya?").click();
  await page.locator("#email").fill(email);
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

/** Registra un propietario nuevo con empresa y MFA activo. Devuelve el secreto TOTP. */
export async function signUpOwner(page: Page, company: string): Promise<{ email: string; secret: string }> {
  const email = uniqueEmail("e2e.owner");
  await loginWithMagicLink(page, email);
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Nombre comercial").fill(company);
  await page.getByRole("button", { name: "Crear empresa" }).click();
  await expect(page).toHaveURL(/\/mfa\/configurar/);
  const secret = (await page.getByTestId("totp-secret").getAttribute("data-secret"))!;
  await page.getByLabel("Código de 6 dígitos de su app").fill(await freshTotp(secret));
  await page.getByRole("button", { name: "Activar verificación" }).click();
  await page.getByRole("link", { name: "Ya guardé mis códigos, continuar" }).click();
  await expect(page.getByTestId("active-tenant")).toContainText(company);
  return { email, secret };
}

/** Simula la acción del panel de plataforma (Fase 4): cambia el plan de la empresa de un usuario. */
export async function setPlanForUser(email: string, planCode: string) {
  const { config } = await import("dotenv");
  config({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });
  const { prisma, withContext } = await import("@rc/db");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const m = await withContext({ userId: user.id }, (tx) => tx.membership.findFirstOrThrow({ where: { userId: user.id } }));
  await withContext({ platformAdmin: true }, async (tx) => {
    const plan = await tx.plan.findUniqueOrThrow({ where: { code: planCode } });
    await tx.subscription.update({ where: { tenantId: m.tenantId }, data: { planId: plan.id } });
  });
}
