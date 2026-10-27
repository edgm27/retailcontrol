import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signUpOwner } from "./helpers";

/*
 * Auditoría automática WCAG 2.2 A/AA con axe-core en las pantallas principales.
 * axe detecta ~30–50 % de los problemas; se complementa con revisión manual (docs/accessibility.md).
 */
async function audit(page: Page, name: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const summary = r.violations.map((v) => `${name}: [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

test("accesibilidad: páginas públicas", async ({ page }) => {
  for (const [path, name] of [["/", "landing"], ["/login", "login"]] as const) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await audit(page, name);
  }
});

test("accesibilidad: aplicación", async ({ page }) => {
  await signUpOwner(page, "Accesible E2E");
  for (const path of [
    "/app",
    "/app/inventario",
    "/app/productos",
    "/app/productos/importar",
    "/app/lotes",
    "/app/compras",
    "/app/reportes",
    "/app/reportes?r=existencias",
    "/app/configuracion/usuarios",
    "/app/configuracion/suscripcion",
    "/cuenta/seguridad",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await audit(page, path);
  }
});
