import { expect, test } from "@playwright/test";
import { signUpOwner } from "./helpers";

test("empresa de demostración: se genera aparte y trae datos para probar todo", async ({ page }) => {
  test.setTimeout(420_000);
  await signUpOwner(page, "Mi Bodega Real E2E");
  await page.goto("/empresas");
  await page.getByRole("button", { name: "Crear empresa de demostración" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Generando la empresa de demostración" })).toBeVisible({ timeout: 20_000 });

  // Espera a que termine (el nombre deja de decir «generando datos…»).
  const demoName = "Demo · Abastos y Ferretería La Esquina (datos ficticios)";
  await expect(async () => {
    await page.goto("/empresas");
    await expect(page.getByText(demoName, { exact: true })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 360_000, intervals: [5_000] });

  await page.locator("form", { hasText: demoName }).getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByTestId("active-tenant")).toContainText("Demo · Abastos");
  const main = page.getByRole("main");
  await expect(main.getByText("Inventario valorizado")).toBeVisible();

  await page.goto("/app/productos?q=VIV-001");
  await expect(main.getByRole("cell", { name: "VIV-001" })).toBeVisible();
  await page.goto("/app/reportes?r=abc&dias=90");
  await expect(main.getByTestId("report-table")).toContainText("A");
  await page.goto("/app/ajustes");
  await expect(main).toContainText("Sacos rotos encontrados");
  await page.goto("/app/compras");
  await expect(main).toContainText("Ferremayor Venezuela (ficticia)");
});
