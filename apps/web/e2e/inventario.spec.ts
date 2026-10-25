import { expect, test } from "@playwright/test";
import { signUpOwner } from "./helpers";

const plusDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

test("inventario: producto perecedero → 2 lotes → salida FEFO → stock bajo, Kardex y tablero", async ({ page }) => {
  await signUpOwner(page, "Minimarket E2E");
  const main = page.getByRole("main");

  // Producto con lote + vencimiento y stock mínimo.
  await page.goto("/app/productos");
  await page.getByLabel("SKU", { exact: true }).fill("LECHE-1L");
  await page.getByLabel("Nombre", { exact: true }).fill("Leche UHT 1L");
  await page.getByLabel("Stock mínimo (opcional)").fill("10");
  await page.getByLabel("Exige fecha de vencimiento (perecedero)").check();
  await page.getByRole("button", { name: "Crear producto" }).click();
  await expect(main.getByText("Producto LECHE-1L creado.")).toBeVisible();

  // Dos entradas con lotes distintos.
  for (const [lot, days, cost] of [["L-TARDE", 40, "1,20"], ["L-PRONTO", 5, "1,00"]] as const) {
    await page.goto("/app/inventario/movimiento");
    await page.getByLabel("Producto (SKU, nombre o código de barras)").fill("LECHE-1L — Leche UHT 1L");
    await page.getByLabel("Cantidad").fill("6");
    await page.getByLabel("Número de lote").fill(lot);
    await page.getByLabel("Fecha de vencimiento").fill(plusDays(days));
    await page.getByLabel("Costo por unidad ingresada (opcional)").fill(cost);
    await page.getByRole("button", { name: "Registrar" }).click();
    await expect(main.getByText("Movimiento registrado: LECHE-1L.")).toBeVisible();
  }

  // Salida de 8 sin indicar lote: FEFO toma L-PRONTO (6) y luego L-TARDE (2).
  await page.getByLabel("Tipo de movimiento").selectOption("ISSUE");
  await page.getByLabel("Producto (SKU, nombre o código de barras)").fill("LECHE-1L — Leche UHT 1L");
  await page.getByLabel("Cantidad").fill("8");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(main.getByText("Movimiento registrado: LECHE-1L (2 lotes por FEFO).")).toBeVisible();

  // Salida mayor que la existencia: rechazada con mensaje claro.
  await expect(page.getByLabel("Tipo de movimiento")).toHaveValue("RECEIPT"); // el formulario se reinicia completo
  await page.getByLabel("Tipo de movimiento").selectOption("ISSUE");
  await page.getByLabel("Producto (SKU, nombre o código de barras)").fill("LECHE-1L");
  await page.getByLabel("Cantidad").fill("50");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(main.getByRole("alert")).toContainText("Existencia insuficiente");

  // Inventario: quedan 4 y está bajo el mínimo.
  await page.goto("/app/inventario?bajo=1");
  const row = main.getByRole("row", { name: /LECHE-1L/ });
  await expect(row).toContainText("4 UND");
  await expect(row).toContainText("Stock bajo");

  // Producto: solo queda L-TARDE con 4.
  await row.getByRole("link", { name: "Leche UHT 1L" }).click();
  await expect(main.getByRole("row", { name: /L-TARDE/ })).toContainText("4");
  await expect(main.getByRole("row", { name: /L-PRONTO/ })).toHaveCount(0);

  // Kardex: saldo acumulado final 4.
  await main.getByRole("link", { name: "Ver Kardex" }).click();
  const first = main.getByRole("row").nth(1);
  await expect(first).toContainText("Salida");
  await expect(first).toContainText("4");

  // Tablero con datos reales.
  await page.goto("/app");
  await expect(main.getByText("Productos con stock bajo")).toBeVisible();
  await expect(main.getByRole("link", { name: /Productos con stock bajo\s*1/ })).toBeVisible();
  await expect(main.getByRole("link", { name: /Lotes por vencer \(30 días\)/ })).toBeVisible();
});
