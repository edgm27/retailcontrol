import { expect, test } from "@playwright/test";
import { grantSuperadmin, signUpOwner } from "./helpers";

test("landing: muestra módulos disponibles (incluido el Reporte ABC) y los pendientes", async ({ page }) => {
  await page.goto("/");
  const disponibles = page.getByTestId("modulos-disponibles");
  await expect(disponibles.getByText("Compras y recepciones")).toBeVisible();
  await expect(disponibles.getByText("Tablero de indicadores")).toBeVisible();
  await expect(disponibles.getByRole("heading", { name: "Reportes y Reporte ABC" })).toBeVisible();
  await expect(disponibles.getByRole("heading", { name: "Exportación a Excel, CSV y PDF" })).toBeVisible();
  const pendientes = page.getByTestId("modulos-pendientes");
  await expect(pendientes.getByRole("heading", { name: "Categorías, marcas y variantes" })).toBeVisible();
  await expect(pendientes.getByText("Pendiente").first()).toBeVisible();
  await expect(page.locator("#precios").getByRole("link", { name: /Comenzar gratis/ }).first()).toHaveAttribute("href", /onboarding%3Fplan%3D/);
});

test("comercialización: plan en el registro → pago en Suscripción → conciliación en el panel de plataforma", async ({ page, browser }) => {
  await signUpOwner(page, "Bodega Pagos E2E");
  const main = page.getByRole("main");

  // El plan por defecto del registro es Profesional (prueba de 14 días).
  await page.goto("/app/configuracion/suscripcion");
  await expect(main.getByText("Prueba gratis: quedan")).toBeVisible();
  await page.getByLabel("Meses que paga").selectOption("3");
  await expect(page.getByTestId("expected-amount")).toContainText("USD 117,00");
  const reference = `E2E${Date.now().toString().slice(-8)}`;
  await page.getByLabel("Número de referencia").fill(reference);
  await page.getByLabel("Monto pagado").fill("117,00");
  await page.getByLabel("Moneda").selectOption("USD");
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(main.getByRole("status").filter({ hasText: "Pago registrado" })).toBeVisible();
  await expect(main.getByRole("row", { name: new RegExp(reference) })).toContainText("En revisión");

  // Superadministrador (otra persona) concilia el pago.
  const ctx = await browser.newContext({ baseURL: new URL(page.url()).origin, locale: "es-VE", timezoneId: "America/Caracas" });
  const p2 = await ctx.newPage();
  const { email: adminEmail } = await signUpOwner(p2, "Operador Plataforma E2E");
  await grantSuperadmin(adminEmail);
  await p2.goto("/plataforma");
  await expect(p2.getByRole("heading", { name: "Resumen de la plataforma" })).toBeVisible();
  await p2.goto("/plataforma/pagos");
  const card = p2.getByTestId("payment-row").filter({ hasText: reference });
  await expect(card).toContainText("Bodega Pagos E2E");
  await card.getByRole("textbox").fill("Verificado en el estado de cuenta");
  await card.getByRole("button", { name: "Aprobar" }).click();
  await expect(card).toHaveCount(0); // sale de "Por conciliar"
  await p2.goto("/plataforma/pagos?estado=APPROVED");
  await expect(p2.getByTestId("payment-row").filter({ hasText: reference })).toContainText("Aprobado");

  // La empresa ve el pago aprobado y el plan activo.
  await page.reload();
  await expect(main.getByRole("row", { name: new RegExp(reference) })).toContainText("Aprobado");
  await expect(main.getByText(/Activa hasta el/)).toBeVisible();

  // Un usuario sin rol de plataforma no ve el panel.
  const resp = await page.goto("/plataforma");
  expect(resp?.status()).toBe(404);
  await ctx.close();
});
