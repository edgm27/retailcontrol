import { randomUUID } from "node:crypto";
import { withContext } from "@rc/db";
import { createProduct, exportReport, requestAdjustment, postStockMovement, REPORT_KEYS, runReport, type TenantActor } from "@rc/domain";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { actorFor, addMember, createCompany, createUser } from "./helpers";

const key = () => `k-${randomUUID()}`;

async function setup(name = "Abastos Reportes") {
  const o = await createUser("rep-dueno");
  const c = await createCompany(o, "PROFESIONAL", name);
  return { owner: await actorFor(o, c.tenant.id), tenantId: c.tenant.id, wh: c.warehouseId };
}

async function product(a: TenantActor, wh: string, sku: string, name: string, inQty: number, cost: number, outQty: number) {
  const id = (await createProduct(a, { sku, name })).id;
  await postStockMovement(a, { idempotencyKey: key(), type: "RECEIPT", warehouseId: wh, productId: id, quantity: String(inQty), unit: "UND", unitCost: String(cost) });
  if (outQty) await postStockMovement(a, { idempotencyKey: key(), type: "ISSUE", warehouseId: wh, productId: id, quantity: String(outQty), unit: "UND" });
  return id;
}

describe("Reportes", () => {
  it("Reporte ABC: clasifica por participación en el valor de las salidas (A ≤ 80 %, B ≤ 95 %, C resto)", async () => {
    const { owner, wh } = await setup();
    await product(owner, wh, "P1", "Producto uno", 100, 1, 70); // 70
    await product(owner, wh, "P2", "Producto dos", 100, 1, 20); // 20
    await product(owner, wh, "P3", "Producto tres", 100, 1, 6); // 6
    await product(owner, wh, "P4", "Producto cuatro", 100, 1, 4); // 4
    await product(owner, wh, "P5", "Sin salidas", 10, 1, 0);
    const r = await runReport(owner, "abc", { days: 30 });
    const cls = Object.fromEntries(r.rows.map((x) => [x.sku, x.clase]));
    expect(cls).toEqual({ P1: "A", P2: "A", P3: "B", P4: "C", P5: "Sin salidas" });
    expect(r.rows[0]).toMatchObject({ sku: "P1", value: 70, share: 70, cum: 70 });
    expect(r.rows.find((x) => x.sku === "P4")).toMatchObject({ cum: 100 });
    expect(r.summary[0]!.value).toContain("2 productos");
  });

  it("todos los reportes se generan; respetan el período y el permiso", async () => {
    const { owner, wh, tenantId } = await setup();
    const id = await product(owner, wh, "M1", "Merma uno", 50, 2, 5);
    // Merma de bajo valor (bajo el umbral de aprobación): se aplica de inmediato.
    await requestAdjustment(owner, { warehouseId: wh, productId: id, direction: "OUT", kind: "WASTE", quantity: "3", unit: "UND", reason: "Producto dañado" });
    for (const k of REPORT_KEYS) {
      const r = await runReport(owner, k, { days: 30 });
      expect(r.columns.length).toBeGreaterThan(2);
    }
    expect((await runReport(owner, "mermas", { days: 30 })).rows[0]).toMatchObject({ sku: "M1", qty: 3, value: 6, reasons: "Producto dañado" });
    expect((await runReport(owner, "existencias")).rows[0]).toMatchObject({ sku: "M1", onHand: 42, value: 84 });
    expect((await runReport(owner, "rotacion", { days: 30 })).rows[0]).toMatchObject({ sku: "M1", qty: 5, coverage: 252 });

    const reader = await createUser("rep-lector");
    await addMember(tenantId, reader, "READONLY");
    const ro = await actorFor(reader, tenantId);
    await expect(runReport(ro, "abc")).resolves.toBeTruthy();
    await expect(exportReport(ro, "abc", {}, "csv")).rejects.toThrow(); // consultar sí, exportar no
  });
});

describe("Exportaciones (aceptación 11)", () => {
  it("cada empresa exporta solo sus datos; la exportación queda auditada", async () => {
    const a = await setup("Empresa A");
    const b = await setup("Empresa B");
    await product(a.owner, a.wh, "SECRETO-A", "Solo de A", 10, 3, 1);
    await product(b.owner, b.wh, "PROPIO-B", "Solo de B", 10, 3, 1);
    for (const k of REPORT_KEYS) {
      const csv = new TextDecoder().decode((await exportReport(b.owner, k, { days: 30 }, "csv")).body);
      expect(csv).not.toContain("SECRETO-A");
      const xlsx = unzipSync((await exportReport(b.owner, k, { days: 30 }, "xlsx")).body);
      expect(strFromU8(xlsx["xl/worksheets/sheet1.xml"]!)).not.toContain("SECRETO-A");
    }
    const csvB = new TextDecoder().decode((await exportReport(b.owner, "existencias", {}, "csv")).body);
    expect(csvB).toContain("PROPIO-B");
    // Un almacén de otra empresa como filtro no devuelve nada.
    const cross = await runReport(b.owner, "existencias", { warehouseId: a.wh });
    expect(cross.rows).toHaveLength(0);
    const audits = await withContext({ tenantId: b.tenantId }, (tx) => tx.auditEvent.count({ where: { tenantId: b.tenantId, action: "report.exported" } }));
    expect(audits).toBe(REPORT_KEYS.length * 2 + 1);
    const auditsA = await withContext({ tenantId: a.tenantId }, (tx) => tx.auditEvent.count({ where: { tenantId: a.tenantId, action: "report.exported" } }));
    expect(auditsA).toBe(0);
  });

  it("CSV para Excel en español y XLSX válido; neutraliza fórmulas", async () => {
    const { owner, wh } = await setup();
    await product(owner, wh, "F1", "=HYPERLINK(\"http://x\",\"clic\")", 10, 1.5, 0);
    const csvBytes = (await exportReport(owner, "existencias", {}, "csv")).body;
    expect(Array.from(csvBytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8
    const csv = new TextDecoder().decode(csvBytes);
    expect(csv.split("\r\n")[0]).toBe("SKU;Producto;Almacén;Existencia;Unidad;Mínimo;Costo prom.;Valor");
    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""clic"")"`);
    expect(csv).toContain(";1,50;15,00");
    const files = unzipSync((await exportReport(owner, "existencias", {}, "xlsx")).body);
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/styles.xml"]));
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]!);
    expect(sheet).toContain("&apos;=HYPERLINK".replace("&apos;", "'"));
    expect(sheet).not.toContain("<f>");
  });
});
