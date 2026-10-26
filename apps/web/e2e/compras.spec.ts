import { expect, test } from "@playwright/test";
import { setPlanForUser, signUpOwner } from "./helpers";

const caracasToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
const plusDays = (d: number) => new Date(Date.parse(`${caracasToday()}T12:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

test("compras en bolívares: proveedor → tasa → orden → aprobar → recibir por lote → tasa congelada → alerta", async ({ page }) => {
  const { email } = await signUpOwner(page, "Abastos Compras E2E");
  // Se fija el plan Básico para comprobar que las compras dependen del plan.
  await setPlanForUser(email, "BASICO");
  const main = page.getByRole("main");

  await page.goto("/app/proveedores");
  await page.getByLabel("Nombre comercial").last().fill("Lácteos del Llano");
  await page.getByLabel("RIF").last().fill("j123456789");
  await page.getByRole("button", { name: "Crear proveedor" }).click();
  await expect(main.getByText("Proveedor Lácteos del Llano creado.")).toBeVisible();
  await expect(main.getByRole("row", { name: /Lácteos del Llano/ })).toContainText("J-12345678-9");

  await page.goto("/app/productos");
  await page.getByLabel("SKU", { exact: true }).fill("QUESO");
  await page.getByLabel("Nombre", { exact: true }).fill("Queso blanco");
  await page.getByLabel("Unidad base").selectOption("KG");
  await page.getByLabel("Exige fecha de vencimiento (perecedero)").check();
  await page.getByRole("button", { name: "Crear producto" }).click();
  await expect(main.getByText("Producto QUESO creado.")).toBeVisible();

  await page.goto("/app/tasas");
  await page.getByLabel("Bs. por 1 USD").fill("40");
  await page.getByLabel("Referencia (opcional)").fill("bcv.org.ve");
  await page.getByRole("button", { name: "Registrar tasa" }).click();
  await expect(main.getByText("Actualizada hoy")).toBeVisible();

  const newOrder = async () => {
    await page.goto("/app/compras/nueva");
    await page.getByLabel("Moneda").selectOption("VES");
    await page.getByLabel("Producto línea 1").fill("QUESO — Queso blanco");
    await page.getByLabel("Cantidad línea 1").fill("10");
    await page.getByLabel("Precio línea 1").fill("200");
    await page.getByRole("button", { name: "Crear borrador" }).click();
  };
  // Plan Básico del onboarding: compras no incluidas (validado en el servidor).
  await newOrder();
  await expect(main.getByRole("alert")).toContainText("no está incluido en su plan");

  await setPlanForUser(email, "PROFESIONAL");
  await newOrder();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("OC-00001 · Lácteos del Llano");
  await expect(main).toContainText("Bs. 2.000,00");
  await page.getByRole("button", { name: "Aprobar orden" }).click();
  await expect(main).toContainText("tasa congelada 40");

  // Recepción parcial: 4 kg del lote Q-1 que vence en 5 días, con flete de Bs. 80.
  await page.getByLabel("Factura o nota de entrega del proveedor").fill("F-777");
  await page.getByLabel("Gastos adicionales (Bs.)").fill("80");
  await page.getByLabel("Cantidad recibida QUESO").fill("4");
  await page.getByLabel("Lote QUESO").fill("Q-1");
  await page.getByLabel("Vencimiento QUESO").fill(plusDays(5));
  await page.getByRole("button", { name: "Registrar recepción" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("REC-00001");
  await expect(main).toContainText("tasa congelada 40");
  // (4 × 200 + 80) / 40 = 22 USD; costo por kg = 5,5
  await expect(main).toContainText("USD 22,00");
  await expect(main.getByRole("row", { name: /QUESO/ })).toContainText("5,5");

  // Cambia la tasa: la recepción conserva la suya.
  await page.goto("/app/tasas");
  await page.getByLabel("Bs. por 1 USD").fill("45");
  await page.getByRole("button", { name: "Registrar tasa" }).click();
  await expect(main.getByText("Bs. 45")).toBeVisible();
  await page.goto("/app/recepciones");
  await page.getByRole("link", { name: "REC-00001" }).click();
  await expect(main).toContainText("tasa congelada 40");
  await expect(main).toContainText("USD 22,00");

  // La orden queda parcial y la alerta de vencimiento aparece.
  await page.goto("/app/compras");
  await expect(main.getByRole("row", { name: /OC-00001/ })).toContainText("Recibida parcial");
  await page.goto("/app/alertas");
  await expect(main.getByTestId("alerts")).toContainText("QUESO vence en 5 día(s)");
});
