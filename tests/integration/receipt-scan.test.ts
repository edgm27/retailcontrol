import { randomUUID } from "node:crypto";
import { withContext } from "@rc/db";
import {
  addProductBarcode,
  addProductUnit,
  createProduct,
  createSupplier,
  getReceiptScanContext,
  lookupProductForReceipt,
  receiveGoods,
  searchProductsForReceipt,
} from "@rc/domain";
import { describe, expect, it } from "vitest";
import { actorFor, addMember, createCompany, createUser } from "./helpers";

const caracas = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
const plus = (d: number) => new Date(Date.parse(`${caracas()}T12:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

async function setup() {
  const o = await createUser("scan-dueno");
  const c = await createCompany(o, "PROFESIONAL", "Abastos Escáner");
  const owner = await actorFor(o, c.tenant.id);
  const supplier = await createSupplier(owner, { name: "Distribuidora Escáner" });
  return { owner, tenantId: c.tenant.id, wh: c.warehouseId, supplierId: supplier.id };
}

describe("Recepción con escáner", () => {
  it("reconoce el código de una presentación y trae unidades, último costo y lotes", async () => {
    const { owner, wh, supplierId } = await setup();
    const p = await createProduct(owner, { sku: "LECHE-1L", name: "Leche 1 L", requiresExpiry: true });
    await addProductUnit(owner, p.id, { code: "CAJA", name: "Caja x12", factorToBase: "12" });
    await addProductBarcode(owner, p.id, { code: "7591234567894" }); // unidad
    await addProductBarcode(owner, p.id, { code: "17591234567891", unitCode: "CAJA" }); // caja (GTIN-14)

    const unit = await lookupProductForReceipt(owner, "7591234567894");
    expect(unit).toMatchObject({ sku: "LECHE-1L", scannedUnit: "UND", lotTracking: true, requiresExpiry: true, lastCost: null });
    expect(unit!.units).toEqual([{ code: "CAJA", name: "Caja x12", factor: "12" }]);

    // Recepción como la arma la pantalla: 2 cajas a 18 USD, lote y vencimiento.
    await receiveGoods(owner, {
      idempotencyKey: `scan-${randomUUID()}`, supplierId, warehouseId: wh, currency: "USD",
      lines: [{ productId: p.id, quantity: "2", unit: "CAJA", unitPrice: "18", lotNumber: "L-A1", expiresAt: plus(40) }],
    });
    const box = await lookupProductForReceipt(owner, " 17591234567891 ");
    expect(box).toMatchObject({ scannedUnit: "CAJA", lastCost: "1.5" }); // 18 / 12 por unidad base
    expect(box!.lots).toEqual([{ lotNumber: "L-A1", expiresAt: plus(40), onHand: "24" }]);

    // También por SKU (lector que lee el código interno) y búsqueda por nombre.
    expect((await lookupProductForReceipt(owner, "leche-1l"))?.sku).toBe("LECHE-1L");
    expect((await searchProductsForReceipt(owner, "lech")).map((x) => x.sku)).toEqual(["LECHE-1L"]);
    expect(await lookupProductForReceipt(owner, "0000000000000")).toBeNull();
    expect(await getReceiptScanContext(owner)).toMatchObject({ baseCurrency: "USD", rate: null });
  });

  it("un código de otra empresa no se reconoce; roles sin permiso de recepción no escanean", async () => {
    const a = await setup();
    const b = await setup();
    const p = await createProduct(a.owner, { sku: "SOLO-A", name: "Solo de A" });
    await addProductBarcode(a.owner, p.id, { code: "ABC-12345" });
    expect(await lookupProductForReceipt(a.owner, "ABC-12345")).not.toBeNull();
    expect(await lookupProductForReceipt(b.owner, "ABC-12345")).toBeNull();
    expect(await searchProductsForReceipt(b.owner, "Solo de A")).toEqual([]);

    const u = await createUser("scan-lector");
    await addMember(a.tenantId, u, "READONLY");
    const ro = await actorFor(u, a.tenantId);
    await expect(lookupProductForReceipt(ro, "ABC-12345")).rejects.toThrow();
  });

  it("reintentar el envío (misma clave) no duplica la recepción ni el stock", async () => {
    const { owner, tenantId, wh, supplierId } = await setup();
    const p = await createProduct(owner, { sku: "ARROZ", name: "Arroz" });
    const payload = {
      idempotencyKey: `scan-${randomUUID()}`, supplierId, warehouseId: wh, currency: "USD" as const,
      lines: [{ productId: p.id, quantity: "10", unit: "UND", unitPrice: "1.2" }],
    };
    const r1 = await receiveGoods(owner, payload);
    const r2 = await receiveGoods(owner, payload);
    expect(r2).toMatchObject({ receiptId: r1.receiptId, replayed: true });
    const onHand = await withContext({ tenantId }, (tx) => tx.stockBalance.aggregate({ where: { tenantId, productId: p.id }, _sum: { onHand: true } }));
    expect(onHand._sum.onHand?.toString()).toBe("10");
  });
});
