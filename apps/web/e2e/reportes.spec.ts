import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { signUpOwner } from "./helpers";

test("importación CSV → reportes → exportación Excel y CSV", async ({ page }) => {
  await signUpOwner(page, "Reportes E2E");
  const main = page.getByRole("main");

  // Importación: plantilla con 3 productos, vista previa y confirmación.
  await page.goto("/app/productos");
  await main.getByRole("link", { name: "Importar desde CSV" }).click();
  const csv = "sku;nombre;unidad;stock_minimo;maneja_lotes;requiere_vencimiento;codigo_barras\nE2E-1;Producto uno;UND;5;no;no;\nE2E-2;Producto dos;KG;;si;si;\nE2E-3;Producto tres;M;10;no;no;7590000000999\n";
  await page.waitForLoadState("networkidle"); // el selector de archivo necesita la página hidratada
  await page.locator("#csv-file").setInputFiles({ name: "productos.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await expect(page.getByTestId("import-counts")).toContainText("Nuevos: 3");
  await page.getByRole("button", { name: "Importar 3 producto(s)" }).click();
  await expect(main.getByText("Importación completada: 3 creado(s)")).toBeVisible();
  await page.goto("/app/productos");
  await expect(main.getByRole("cell", { name: "E2E-3" })).toBeVisible();

  // Reportes: ABC por defecto y cambio a existencias.
  await page.goto("/app/reportes");
  await expect(main.getByRole("heading", { name: "Reporte ABC" })).toBeVisible();
  await main.getByRole("link", { name: "Existencias valorizadas" }).click();
  await expect(main.getByRole("heading", { name: "Existencias valorizadas" })).toBeVisible();

  // Exportaciones.
  const [xlsx] = await Promise.all([page.waitForEvent("download"), main.getByRole("link", { name: "Excel (XLSX)" }).click()]);
  expect(xlsx.suggestedFilename()).toMatch(/^retailcontrol-existencias-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const [csvDl] = await Promise.all([page.waitForEvent("download"), main.getByRole("link", { name: "CSV" }).click()]);
  const content = await readFile((await csvDl.path())!, "utf8");
  expect(content).toContain("SKU;Producto;Almacén;Existencia");

  // Un usuario sin sesión no puede descargar.
  const anon = await page.context().browser()!.newContext({ baseURL: new URL(page.url()).origin });
  const res = await anon.request.get("/app/reportes/exportar?reporte=existencias&formato=csv", { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(res.status());
  await anon.close();
});
