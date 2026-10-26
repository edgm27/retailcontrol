import { expect, test } from "@playwright/test";
import { freshTotp, loginWithMagicLink, uniqueEmail } from "./helpers";

/**
 * Aceptación 10 de punta a punta: registro, onboarding, MFA TOTP obligatorio
 * para propietario, recuperación con código de un solo uso y revocación de
 * sesiones en otro dispositivo.
 */
test("propietario: registro → empresa → MFA obligatorio → recuperación → revocación", async ({ page, browser }) => {
  const email = uniqueEmail("e2e.dueno");

  // Rutas privadas sin sesión → login.
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp/);

  // 1. Enlace mágico → sin empresas → onboarding.
  await loginWithMagicLink(page, email);
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Nombre comercial").fill("Abastos E2E");
  await page.getByLabel("RIF (opcional)").fill("j123456789");
  await page.getByRole("button", { name: "Crear empresa" }).click();

  // 2. El rol propietario exige MFA antes de entrar.
  await expect(page).toHaveURL(/\/mfa\/configurar\?motivo=rol/);
  await expect(page.getByRole("img", { name: /Código QR/ })).toBeVisible();
  const secret = (await page.getByTestId("totp-secret").getAttribute("data-secret"))!;
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);

  await page.getByLabel("Código de 6 dígitos de su app").fill("000000");
  await page.getByRole("button", { name: "Activar verificación" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Código incorrecto");

  await page.getByLabel("Código de 6 dígitos de su app").fill(await freshTotp(secret));
  await page.getByRole("button", { name: "Activar verificación" }).click();
  await expect(page.getByTestId("recovery-codes").locator("li")).toHaveCount(10);
  const codes = await page.getByTestId("recovery-codes").locator("li").allTextContents();
  expect(codes).toHaveLength(10);
  await page.getByRole("link", { name: "Ya guardé mis códigos, continuar" }).click();

  // 3. Dentro de la empresa.
  await expect(page.getByTestId("active-tenant")).toContainText("Abastos E2E · Propietario");
  // En móvil el menú lateral se abre con el botón de menú.
  await page.getByRole("button", { name: "Abrir menú" }).click();
  const menu = page.getByRole("dialog", { name: "Menú" });
  // El menú debe ocupar el alto de la pantalla y mostrar todas las secciones (no quedar recortado).
  const box = await menu.boundingBox();
  expect(box!.height).toBeGreaterThan(page.viewportSize()!.height * 0.9);
  for (const name of ["Inicio", "Alertas", "Inventario", "Productos"]) {
    await expect(menu.getByRole("link", { name, exact: true })).toBeInViewport();
  }
  // Las últimas opciones se alcanzan desplazando el menú.
  const last = menu.getByRole("link", { name: "Suscripción", exact: true });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  await menu.getByRole("link", { name: "Productos", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Menú" })).toBeHidden();
  await page.getByLabel("SKU", { exact: true }).fill("harina-1kg");
  await page.getByLabel("Nombre", { exact: true }).fill("Harina 1 kg");
  await page.getByRole("button", { name: "Crear producto" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("Producto HARINA-1KG creado.");
  await expect(page.getByRole("cell", { name: "HARINA-1KG" })).toBeVisible();

  // 4. Salir y volver a entrar: exige segundo factor; se usa un código de recuperación.
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/$/);
  await loginWithMagicLink(page, email);
  await expect(page).toHaveURL(/\/mfa\/verificar/);
  // Sin verificar, /app no es accesible.
  await page.goto("/app");
  await expect(page).toHaveURL(/\/mfa\/verificar/);
  await page.getByText("¿Perdió su teléfono?").click();
  await page.getByLabel("Código de recuperación").fill(codes[0]!);
  await page.getByRole("button", { name: "Usar código de recuperación" }).click();
  await expect(page).toHaveURL(/\/cuenta\/seguridad\?recuperacion=1/);
  await expect(page.getByText("Le quedan 9")).toBeVisible();

  // 4b. Definir contraseña desde Seguridad.
  await page.getByLabel("Nueva contraseña", { exact: true }).fill("Clave-E2E-Segura-2026");
  await page.getByLabel("Confirmar nueva contraseña").fill("Clave-E2E-Segura-2026");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByText(/Contraseña guardada/)).toBeVisible();

  // 5. Segundo dispositivo con TOTP.
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await loginWithMagicLink(page2, email);
  await expect(page2).toHaveURL(/\/mfa\/verificar/);
  // El mismo código de recuperación ya no sirve.
  await page2.getByText("¿Perdió su teléfono?").click();
  await page2.getByLabel("Código de recuperación").fill(codes[0]!);
  await page2.getByRole("button", { name: "Usar código de recuperación" }).click();
  await expect(page2.getByRole("main").getByRole("alert")).toContainText("Código incorrecto");
  await page2.getByLabel("Código", { exact: true }).fill(await freshTotp(secret));
  await page2.getByRole("button", { name: "Verificar", exact: true }).click();
  await expect(page2.getByTestId("active-tenant")).toContainText("Abastos E2E");

  // 6. Desde el primer dispositivo, cerrar las demás sesiones → el segundo pierde acceso.
  await page.reload();
  await expect(page.getByTestId("sessions").locator("li")).toHaveCount(2);
  await page.getByRole("button", { name: "Cerrar las demás sesiones" }).click();
  await expect(page.getByText("Se cerraron 1 sesión(es) en otros dispositivos.")).toBeVisible();
  await page2.goto("/app");
  await expect(page2).toHaveURL(/\/login/);
  await other.close();

  // 7. Entrar con correo + contraseña: como tiene MFA activo, pide el código.
  await page.goto("/app");
  await page.getByRole("button", { name: "Salir" }).click();
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").first().fill(email);
  await page.getByLabel("Contraseña").fill("clave-incorrecta-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Correo o contraseña incorrectos");
  await page.getByLabel("Contraseña").fill("Clave-E2E-Segura-2026");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/mfa\/verificar/);
  await page.getByLabel("Código", { exact: true }).fill(await freshTotp(secret));
  await page.getByRole("button", { name: "Verificar", exact: true }).click();
  await expect(page.getByTestId("active-tenant")).toContainText("Abastos E2E");
});

test("cabeceras de seguridad y CSP con nonce", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-powered-by"]).toBeUndefined();
  expect(h["x-correlation-id"]).toMatch(/^[\w-]{8,64}$/);
});

test("la landing hidrata sin errores de CSP, con video de fondo silenciado y carrusel", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tu inventario");
  // El video de fondo existe, está silenciado y no tiene controles de sonido.
  const video = page.getByTestId("hero-video");
  await expect(video).toHaveJSProperty("muted", true);
  await expect(page.getByTestId("slide-title")).toContainText("lotes y vencimientos");
  await page.getByRole("button", { name: "Ir a la diapositiva 2 de 3" }).click();
  await expect(page.getByTestId("slide-title")).toContainText("sucursales");
  await expect(video).toHaveAttribute("src", "/media/inventario.mp4");
  // Precios desde la base de datos.
  await expect(page.locator("#precios")).toContainText("Profesional");
  await page.getByRole("link", { name: "Iniciar sesión" }).first().click();
  await expect(page).toHaveURL(/\/login/);
  expect(errors.filter((e) => /Content Security Policy|Refused/i.test(e))).toEqual([]);
});
