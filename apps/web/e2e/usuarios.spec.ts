import { expect, test } from "@playwright/test";
import { freshTotp, signUpOwner, uniqueEmail } from "./helpers";

test("usuarios: crear con clave temporal + rol + 2FA → cambio de clave obligatorio → vincular app por QR/enlace → desactivar 2FA y eliminar", async ({ page, browser }) => {
  await signUpOwner(page, "Ferretería Usuarios E2E");
  const main = page.getByRole("main");

  // 1. El propietario crea el usuario (sin invitación).
  await page.goto("/app/configuracion/usuarios");
  await main.getByRole("link", { name: "Nuevo usuario" }).click();
  const email = uniqueEmail("e2e.almacen");
  await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
  await page.getByLabel("Nombre y apellido").fill("Almacenista Prueba");
  await page.getByLabel("Rol", { exact: true }).selectOption("WAREHOUSE");
  await page.getByRole("button", { name: "Generar" }).click();
  const temp = await page.getByLabel("Clave temporal", { exact: true }).inputValue();
  expect(temp).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
  await page.getByLabel(/Activar verificación en dos pasos/).check();
  await page.getByRole("button", { name: "Crear usuario" }).click();
  await expect(page.getByTestId("user-credentials")).toContainText(temp);

  await page.goto("/app/configuracion/usuarios");
  const row = main.getByRole("row", { name: new RegExp(email.replace(/\./g, "\\.")) });
  await expect(row).toContainText("Almacenista");
  await expect(row).toContainText("Pendiente de vincular");
  await expect(row).toContainText("Temporal");

  // 2. El usuario entra con la clave temporal y debe cambiarla.
  const ctx2 = await browser.newContext({ baseURL: new URL(page.url()).origin, locale: "es-VE", timezoneId: "America/Caracas" });
  const p2 = await ctx2.newPage();
  await p2.goto("/login");
  await p2.locator("#pw-email").fill(email);
  await p2.locator("#password").fill(temp);
  await p2.getByRole("button", { name: "Entrar" }).click();
  await expect(p2).toHaveURL(/\/cuenta\/cambiar-clave/);
  await p2.getByLabel("Clave temporal", { exact: true }).fill(temp);
  await p2.getByLabel("Nueva contraseña", { exact: true }).fill("Mi-Clave-Personal-2026");
  await p2.getByLabel("Repita la nueva contraseña").fill("Mi-Clave-Personal-2026");
  await p2.getByRole("button", { name: "Guardar y continuar" }).click();

  // 3. La empresa le exige 2FA: QR + enlace para abrir Google Authenticator.
  await expect(p2).toHaveURL(/\/mfa\/configurar/);
  await expect(p2.getByRole("img", { name: /Código QR/ })).toBeVisible();
  await expect(p2.getByTestId("totp-link")).toHaveAttribute("href", /^otpauth:\/\/totp\//);
  const secret = (await p2.getByTestId("totp-secret").getAttribute("data-secret"))!;
  await p2.getByLabel("Código de 6 dígitos de su app").fill(await freshTotp(secret));
  await p2.getByRole("button", { name: "Activar verificación" }).click();
  await p2.getByRole("link", { name: "Ya guardé mis códigos, continuar" }).click();
  await expect(p2.getByTestId("active-tenant")).toContainText("Ferretería Usuarios E2E · Almacenista");

  // 4. El propietario ve la 2FA activa, la desactiva y luego elimina al usuario.
  await page.reload();
  await expect(row).toContainText("Activa");
  await expect(row).toContainText("Personal");
  await row.getByRole("link", { name: `Editar ${email}` }).click();
  await page.getByRole("button", { name: "Desactivar 2FA" }).click();
  await expect(main.getByRole("status").filter({ hasText: "2FA desactivada" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Activar 2FA" })).toBeVisible();

  // Sus sesiones se cerraron.
  await p2.goto("/app");
  await expect(p2).toHaveURL(/\/login/);

  await page.getByLabel("Confirmo que deseo eliminar este usuario").check();
  await page.getByRole("button", { name: "Eliminar usuario" }).click();
  await expect(page).toHaveURL(/eliminado=1/);
  await expect(main.getByText(email)).toHaveCount(0);

  // La cuenta administrada queda deshabilitada.
  await p2.goto("/login");
  await p2.locator("#pw-email").fill(email);
  await p2.locator("#password").fill("Mi-Clave-Personal-2026");
  await p2.getByRole("button", { name: "Entrar" }).click();
  await expect(p2.getByText("Correo o contraseña incorrectos.")).toBeVisible();
  await ctx2.close();
});
