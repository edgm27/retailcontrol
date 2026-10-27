import { expect, test } from "@playwright/test";
import { seedScanCatalog, signUpOwner } from "./helpers";

const plusDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

test("recepción con escáner en el celular: cámara → caja con lote y vencimiento → código nuevo → registrar", async ({ page, context }) => {
  await context.grantPermissions(["camera"]);
  // Lector de códigos simulado: la cámara es falsa (Chromium) y el "detector" devuelve el código que fije la prueba.
  await page.addInitScript(() => {
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = class {
      static async getSupportedFormats() {
        return ["ean_13", "code_128"];
      }
      async detect() {
        const code = (window as unknown as { __fakeCode?: string }).__fakeCode;
        return code ? [{ rawValue: code }] : [];
      }
    };
  });
  const { email } = await signUpOwner(page, "Abastos Escáner E2E");
  await seedScanCatalog(email);
  const main = page.getByRole("main");

  await page.goto("/app/recepciones/escanear");
  await expect(main.getByRole("heading", { name: "Recibir con escáner" })).toBeVisible();

  // 1. Escanear con la cámara el código de la CAJA.
  await page.evaluate(() => ((window as unknown as { __fakeCode?: string }).__fakeCode = undefined));
  await main.getByRole("button", { name: "Escanear código con la cámara" }).click();
  const camera = page.getByRole("dialog", { name: "Escanear código de barras" });
  await expect(camera).toBeVisible();
  await expect(camera.getByRole("status")).toHaveText("Apunte al código de barras dentro del recuadro");
  await page.evaluate(() => ((window as unknown as { __fakeCode?: string }).__fakeCode = "17591234567891"));
  await expect(camera).toBeHidden();

  const editor = page.getByTestId("scan-line-editor");
  await expect(editor.getByRole("heading", { name: "Leche entera 1 L" })).toBeVisible();
  await expect(editor.getByLabel("Unidad")).toHaveValue("CAJA");
  await editor.getByLabel("Cantidad").fill("2");
  await editor.getByLabel(/Costo por CAJA/).fill("18");
  await editor.getByLabel("Lote", { exact: true }).fill("l-e2e-1");
  await editor.getByLabel("Vencimiento", { exact: true }).fill(plusDays(60));
  await editor.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(page.getByTestId("scan-lines")).toContainText("2 CAJA × USD 18,00 = USD 36,00");
  await expect(page.getByTestId("scan-lines")).toContainText("Lote L-E2E-1");

  // 2. Un código no registrado (escrito o con lector USB): se busca el producto y se guarda el código.
  await main.getByLabel("Código de barras o SKU").fill("7590000000009");
  await main.getByRole("button", { name: "Buscar" }).click();
  const nf = page.getByTestId("scan-not-found");
  await expect(nf).toContainText("7590000000009");
  await nf.getByLabel("Buscar producto").fill("arroz");
  await nf.getByRole("button", { name: /Arroz blanco 1 kg/ }).click();
  await expect(editor.getByRole("heading", { name: "Arroz blanco 1 kg" })).toBeVisible();
  await editor.getByLabel("Cantidad").fill("10");
  await editor.getByLabel(/Costo por UND/).fill("1,25");
  await editor.getByRole("button", { name: "Agregar", exact: true }).click();

  // 3. El borrador sobrevive a recargar la página (señal débil, teléfono bloqueado…).
  await page.reload();
  await expect(page.getByTestId("scan-lines").getByRole("listitem")).toHaveCount(2);

  // La próxima vez el código se reconoce solo.
  await main.getByLabel("Código de barras o SKU").fill("7590000000009");
  await main.getByRole("button", { name: "Buscar" }).click();
  await expect(editor.getByRole("heading", { name: "Arroz blanco 1 kg" })).toBeVisible();
  await editor.getByRole("button", { name: "Cancelar" }).click();

  // 4. Registrar.
  await page.getByRole("button", { name: "Registrar recepción" }).click();
  await expect(page.getByTestId("scan-receipt-done")).toContainText("registrada");
  await page.getByRole("link", { name: "Ver recepción" }).click();
  await expect(main).toContainText("L-E2E-1");
  await expect(main).toContainText("Arroz blanco 1 kg");
});
