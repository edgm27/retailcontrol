import { randomUUID } from "node:crypto";
import { withContext } from "@rc/db";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  countUnreadNotifications,
  createProduct,
  createPurchaseOrder,
  createSupplier,
  createTaxRate,
  getGoodsReceipt,
  getPurchaseOrder,
  getRateStatus,
  listKardex,
  listNotifications,
  listReplenishmentSuggestions,
  listStock,
  markNotificationsRead,
  postStockMovement,
  receiveGoods,
  recordExchangeRate,
  reverseOperation,
  runTenantAlerts,
  updateProductCommercial,
  updateTenantSettings,
  type TenantActor,
} from "@rc/domain";
import { beforeAll, describe, expect, it } from "vitest";
import { actorFor, addMember, createCompany, createUser } from "./helpers";

const key = () => `k-${randomUUID()}`;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
// Fechas relativas al "hoy" de Caracas (la zona de la empresa), no a UTC.
const plus = (d: number) => new Date(Date.parse(`${today()}T12:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

async function setup(plan = "PROFESIONAL") {
  const o = await createUser("compras");
  const c = await createCompany(o, plan, "Abastos Compras");
  const owner = await actorFor(o, c.tenant.id);
  const mk = async (role: TenantActor["role"]) => {
    const u = await createUser(role.toLowerCase());
    await addMember(c.tenant.id, u, role);
    return actorFor(u, c.tenant.id);
  };
  return { owner, tenantId: c.tenant.id, warehouseId: c.warehouseId, mk };
}
const stockOf = async (a: TenantActor, productId: string) => (await listStock(a, { pageSize: 200 })).items.find((i) => i.productId === productId)!;

describe("Tasas de cambio (aceptaciones 3 y 8)", () => {
  it("solo propietario/administrador registran tasas; el historial es inmutable y auditado", async () => {
    const ctx = await setup();
    const manager = await ctx.mk("MANAGER");
    await expect(recordExchangeRate(manager, { rate: "36,50", effectiveDate: today() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const r = await recordExchangeRate(ctx.owner, { rate: "36,5012", effectiveDate: today(), sourceReference: "bcv.org.ve 08:30" });
    expect(r.rate.toString()).toBe("36.5012");
    const st = await getRateStatus(manager);
    expect(st).toMatchObject({ upToDate: true, current: { rate: "36.5012" } });
    await expect(recordExchangeRate(ctx.owner, { rate: "40", effectiveDate: plus(3) })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(withContext({ tenantId: ctx.tenantId }, (tx) => tx.exchangeRate.updateMany({ data: { rate: 1 } }))).rejects.toThrow();
    const audit = await withContext({ tenantId: ctx.tenantId }, (tx) => tx.auditEvent.findFirst({ where: { action: "exchange_rate.recorded", entityId: r.id } }));
    expect(audit?.actorUserId).toBe(ctx.owner.userId);
  });

  it("aceptación 8: un cambio de tasa NO altera costos ni documentos históricos", async () => {
    const ctx = await setup();
    const sup = await createSupplier(ctx.owner, { name: "Distribuidora Ejemplo", rif: "J-12345678-9" });
    const p = (await createProduct(ctx.owner, { sku: "ARROZ", name: "Arroz 1 kg" })).id;
    await recordExchangeRate(ctx.owner, { rate: "40", effectiveDate: today() });
    // Recepción en bolívares sin orden: 10 unidades a Bs. 80 = USD 2 c/u con tasa 40.
    const rec = await receiveGoods(ctx.owner, {
      idempotencyKey: key(), supplierId: sup.id, warehouseId: ctx.warehouseId, currency: "VES",
      lines: [{ productId: p, quantity: "10", unit: "UND", unitPrice: "80" }],
    });
    expect(rec).toMatchObject({ exchangeRate: "40", totalBase: "20" });
    const before = await getGoodsReceipt(ctx.owner, rec.receiptId);
    const kBefore = await listKardex(ctx.owner, { productId: p });

    // La tasa cambia (se registra una nueva, más reciente).
    await recordExchangeRate(ctx.owner, { rate: "50", effectiveDate: today(), sourceReference: "corrección" });

    const after = await getGoodsReceipt(ctx.owner, rec.receiptId);
    const kAfter = await listKardex(ctx.owner, { productId: p });
    expect(after.exchangeRate?.toString()).toBe("40");
    expect(after.totalBase.toString()).toBe(before.totalBase.toString());
    expect(after.lines[0]!.landedUnitCost.toString()).toBe("2");
    expect(kAfter.items[0]!.unitCost).toBe(kBefore.items[0]!.unitCost);
    expect((await stockOf(ctx.owner, p)).avgCost).toBe("2");
    // Los documentos de recepción tampoco se pueden editar en la base de datos.
    await expect(withContext({ tenantId: ctx.tenantId }, (tx) => tx.goodsReceipt.updateMany({ data: { exchangeRate: 50 } }))).rejects.toThrow();
    // La siguiente recepción sí usa la tasa nueva.
    const rec2 = await receiveGoods(ctx.owner, {
      idempotencyKey: key(), supplierId: sup.id, warehouseId: ctx.warehouseId, currency: "VES",
      lines: [{ productId: p, quantity: "10", unit: "UND", unitPrice: "100" }],
    });
    expect(rec2.exchangeRate).toBe("50");
    expect((await stockOf(ctx.owner, p)).avgCost).toBe("2"); // (10×2 + 10×2)/20
  });

  it("sin tasa registrada no se recibe en otra moneda", async () => {
    const ctx = await setup();
    const sup = await createSupplier(ctx.owner, { name: "Proveedor sin tasa" });
    const p = (await createProduct(ctx.owner, { sku: "SAL", name: "Sal" })).id;
    await expect(
      receiveGoods(ctx.owner, { idempotencyKey: key(), supplierId: sup.id, warehouseId: ctx.warehouseId, currency: "VES", lines: [{ productId: p, quantity: "1", unit: "UND", unitPrice: "10" }] }),
    ).rejects.toThrow(/tasa/);
  });
});

describe("Proveedores", () => {
  it("valida RIF y no repite RIF en la misma empresa; otra empresa sí puede tenerlo", async () => {
    const a = await setup();
    const b = await setup();
    await expect(createSupplier(a.owner, { name: "Malo", rif: "123" })).rejects.toThrow();
    await createSupplier(a.owner, { name: "Uno", rif: "j-11111111-1" });
    await expect(createSupplier(a.owner, { name: "Dos", rif: "J111111111" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createSupplier(b.owner, { name: "Uno en B", rif: "J-11111111-1" })).resolves.toBeTruthy();
    const clerk = await a.mk("WAREHOUSE");
    await expect(createSupplier(clerk, { name: "Sin permiso" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("Órdenes de compra y recepciones", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let supplierId: string;
  let leche: string;
  let harina: string;

  beforeAll(async () => {
    ctx = await setup();
    supplierId = (await createSupplier(ctx.owner, { name: "Lácteos del Centro", rif: "J-22222222-2" })).id;
    leche = (await createProduct(ctx.owner, { sku: "LECHE", name: "Leche UHT", requiresExpiry: true, minStock: "50" })).id;
    harina = (await createProduct(ctx.owner, { sku: "HARINA", name: "Harina", minStock: "10" })).id;
    await createTaxRate(ctx.owner, { code: "G", name: "General (ejemplo)", rate: "16", validFrom: today() });
  });

  it("borrador → aprobada → recepción parcial por lote → recibida, con gastos prorrateados", async () => {
    const po = await createPurchaseOrder(ctx.owner, {
      supplierId, warehouseId: ctx.warehouseId, currency: "USD",
      lines: [
        { productId: leche, quantity: "24", unit: "UND", unitPrice: "1,00", taxRate: "16" },
        { productId: harina, quantity: "10", unit: "UND", unitPrice: "2" },
      ],
    });
    expect(po).toMatchObject({ number: 1, status: "DRAFT" });
    expect([po.subtotal.toString(), po.taxTotal.toString(), po.total.toString()]).toEqual(["44", "3.84", "47.84"]);

    const full = await getPurchaseOrder(ctx.owner, po.id);
    const lecheLine = full.lines.find((l) => l.productId === leche)!;
    const harinaLine = full.lines.find((l) => l.productId === harina)!;
    // No se recibe un borrador.
    await expect(receiveGoods(ctx.owner, { idempotencyKey: key(), purchaseOrderId: po.id, supplierId, warehouseId: ctx.warehouseId, currency: "USD", lines: [{ purchaseOrderLineId: harinaLine.id, productId: harina, quantity: "1", unit: "UND", unitPrice: "2" }] })).rejects.toMatchObject({ code: "CONFLICT" });

    await approvePurchaseOrder(ctx.owner, po.id);
    // Recepción parcial: 12 leches en dos lotes, más flete de 4 (prorrateado por valor).
    const r1 = await receiveGoods(ctx.owner, {
      idempotencyKey: key(), purchaseOrderId: po.id, supplierId, warehouseId: ctx.warehouseId, currency: "USD",
      supplierInvoice: "F-0001", additionalCosts: "4",
      lines: [
        { purchaseOrderLineId: lecheLine.id, productId: leche, quantity: "6", unit: "UND", unitPrice: "1", lotNumber: "L-A", expiresAt: plus(20) },
        { purchaseOrderLineId: lecheLine.id, productId: leche, quantity: "6", unit: "UND", unitPrice: "1", lotNumber: "L-B", expiresAt: plus(40) },
        { purchaseOrderLineId: harinaLine.id, productId: harina, quantity: "0", unit: "UND", unitPrice: "2" },
      ],
    });
    expect(r1.totalBase).toBe("16"); // 12 + 4 de flete
    const rec = await getGoodsReceipt(ctx.owner, r1.receiptId);
    expect(rec.lines).toHaveLength(2);
    expect(rec.lines.every((l) => l.landedUnitCost.toString() === "1.333333")).toBe(true); // (6 + 2) / 6
    expect((await getPurchaseOrder(ctx.owner, po.id)).status).toBe("PARTIALLY_RECEIVED");

    // No se puede recibir más de lo pendiente.
    await expect(
      receiveGoods(ctx.owner, { idempotencyKey: key(), purchaseOrderId: po.id, supplierId, warehouseId: ctx.warehouseId, currency: "USD", lines: [{ purchaseOrderLineId: lecheLine.id, productId: leche, quantity: "13", unit: "UND", unitPrice: "1", lotNumber: "L-C", expiresAt: plus(50) }] }),
    ).rejects.toThrow(/pendientes/);

    // Completar: diferencia de precio queda registrada contra el precio pactado.
    const r2 = await receiveGoods(ctx.owner, {
      idempotencyKey: key(), purchaseOrderId: po.id, supplierId, warehouseId: ctx.warehouseId, currency: "USD",
      lines: [
        { purchaseOrderLineId: lecheLine.id, productId: leche, quantity: "12", unit: "UND", unitPrice: "1,10", lotNumber: "L-C", expiresAt: plus(50) },
        { purchaseOrderLineId: harinaLine.id, productId: harina, quantity: "10", unit: "UND", unitPrice: "2" },
      ],
    });
    const rec2 = await getGoodsReceipt(ctx.owner, r2.receiptId);
    const priced = rec2.lines.find((l) => l.productId === leche)!;
    expect([priced.unitPrice.toString(), priced.orderedUnitPrice?.toString()]).toEqual(["1.1", "1"]);
    expect((await getPurchaseOrder(ctx.owner, po.id)).status).toBe("RECEIVED");
    expect((await stockOf(ctx.owner, leche)).onHand).toBe("24");
    expect(r2.receiptId).not.toBe(r1.receiptId);
  });

  it("aceptación 4 en compras: la misma recepción reenviada no duplica stock ni documento", async () => {
    const before = Number((await stockOf(ctx.owner, harina)).onHand);
    const input = { idempotencyKey: key(), supplierId, warehouseId: ctx.warehouseId, currency: "USD" as const, lines: [{ productId: harina, quantity: "5", unit: "UND", unitPrice: "2" }] };
    const results = await Promise.all([receiveGoods(ctx.owner, input), receiveGoods(ctx.owner, input), receiveGoods(ctx.owner, input)]);
    expect(new Set(results.map((r) => r.receiptId)).size).toBe(1);
    expect(Number((await stockOf(ctx.owner, harina)).onHand)).toBe(before + 5);
  });

  it("un movimiento de recepción no se revierte con el reverso genérico", async () => {
    const r = await receiveGoods(ctx.owner, { idempotencyKey: key(), supplierId, warehouseId: ctx.warehouseId, currency: "USD", lines: [{ productId: harina, quantity: "1", unit: "UND", unitPrice: "2" }] });
    await expect(reverseOperation(ctx.owner, r.operationId, "Intento de reverso")).rejects.toThrow(/devolución a proveedor/);
  });

  it("orden en bolívares: la tasa se congela al aprobar", async () => {
    await recordExchangeRate(ctx.owner, { rate: "45", effectiveDate: today() });
    const po = await createPurchaseOrder(ctx.owner, { supplierId, warehouseId: ctx.warehouseId, currency: "VES", lines: [{ productId: harina, quantity: "1", unit: "UND", unitPrice: "90" }] });
    await approvePurchaseOrder(ctx.owner, po.id);
    await recordExchangeRate(ctx.owner, { rate: "47", effectiveDate: today() });
    expect((await getPurchaseOrder(ctx.owner, po.id)).exchangeRate?.toString()).toBe("45");
    await cancelPurchaseOrder(ctx.owner, po.id, "Ya no se necesita");
    expect((await getPurchaseOrder(ctx.owner, po.id)).status).toBe("CANCELLED");
  });

  it("permisos: el comprador crea órdenes pero no las aprueba ni recibe; el almacenista recibe", async () => {
    const buyer = await ctx.mk("BUYER");
    const clerk = await ctx.mk("WAREHOUSE");
    const po = await createPurchaseOrder(buyer, { supplierId, warehouseId: ctx.warehouseId, currency: "USD", lines: [{ productId: harina, quantity: "2", unit: "UND", unitPrice: "2" }] });
    await expect(approvePurchaseOrder(buyer, po.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await approvePurchaseOrder(ctx.owner, po.id);
    const line = (await getPurchaseOrder(ctx.owner, po.id)).lines[0]!;
    await expect(receiveGoods(buyer, { idempotencyKey: key(), purchaseOrderId: po.id, supplierId, warehouseId: ctx.warehouseId, currency: "USD", lines: [{ purchaseOrderLineId: line.id, productId: harina, quantity: "2", unit: "UND", unitPrice: "2" }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(receiveGoods(clerk, { idempotencyKey: key(), purchaseOrderId: po.id, supplierId, warehouseId: ctx.warehouseId, currency: "USD", lines: [{ purchaseOrderLineId: line.id, productId: harina, quantity: "2", unit: "UND", unitPrice: "2" }] })).resolves.toBeTruthy();
  });

  it("plan Básico: compras no incluidas", async () => {
    const basic = await setup("BASICO");
    const sup = await createSupplier(basic.owner, { name: "Proveedor básico" });
    const p = (await createProduct(basic.owner, { sku: "X1", name: "Producto X" })).id;
    await expect(createPurchaseOrder(basic.owner, { supplierId: sup.id, warehouseId: basic.warehouseId, currency: "USD", lines: [{ productId: p, quantity: "1", unit: "UND", unitPrice: "1" }] })).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
  });
});

describe("Reposición sugerida y alertas", () => {
  it("sugiere reponer bajo el mínimo considerando lo ya pedido; no compra sola", async () => {
    const ctx = await setup();
    const sup = await createSupplier(ctx.owner, { name: "Proveedor preferido" });
    const p = (await createProduct(ctx.owner, { sku: "AZUCAR", name: "Azúcar", minStock: "20" })).id;
    await updateProductCommercial(ctx.owner, p, { preferredSupplierId: sup.id, referencePrice: "1,50", referenceCurrency: "USD" });
    await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: ctx.warehouseId, productId: p, quantity: "30", unit: "UND", unitCost: "1" });
    await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "ISSUE", warehouseId: ctx.warehouseId, productId: p, quantity: "25", unit: "UND" });
    const s1 = await listReplenishmentSuggestions(ctx.owner);
    const item = s1.items.find((i) => i.productId === p)!;
    expect(item).toMatchObject({ available: "5", supplierName: "Proveedor preferido", suggested: "35" }); // objetivo 2×20=40 − 5
    const po = await createPurchaseOrder(ctx.owner, { supplierId: sup.id, warehouseId: ctx.warehouseId, currency: "USD", lines: [{ productId: p, quantity: "35", unit: "UND", unitPrice: "1" }] });
    expect(po.status).toBe("DRAFT");
    expect((await listReplenishmentSuggestions(ctx.owner)).items.find((i) => i.productId === p)).toBeUndefined();
  });

  it("alertas de vencimiento y stock bajo: idempotentes, por usuario y aisladas por empresa", async () => {
    const ctx = await setup();
    const other = await setup();
    const clerk = await ctx.mk("WAREHOUSE");
    const p = (await createProduct(ctx.owner, { sku: "YOGUR", name: "Yogur", requiresExpiry: true, minStock: "100" })).id;
    await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: ctx.warehouseId, productId: p, quantity: "10", unit: "UND", lotNumber: "Y1", expiresAt: plus(5) });
    const first = await runTenantAlerts(ctx.tenantId);
    expect(first).toMatchObject({ candidates: 2, created: 4 }); // 2 avisos × 2 destinatarios
    expect((await runTenantAlerts(ctx.tenantId)).created).toBe(0); // idempotente
    const mine = await listNotifications(clerk);
    expect(mine.map((n) => n.kind).sort()).toEqual(["expiry", "low_stock"]);
    expect(mine.find((n) => n.kind === "expiry")?.title).toMatch(/vence en 5 día/);
    expect(await countUnreadNotifications(clerk)).toBe(2);
    await markNotificationsRead(clerk);
    expect(await countUnreadNotifications(clerk)).toBe(0);
    expect(await countUnreadNotifications(ctx.owner)).toBe(2); // cada usuario las suyas
    expect(await listNotifications(other.owner)).toHaveLength(0);
    // Con umbrales configurados más cortos, el mismo lote no genera un aviso nuevo hasta cruzar el siguiente.
    await updateTenantSettings(ctx.owner, { baseCurrency: "USD", adjustmentApprovalThreshold: "100", allowNegativeStock: false, mfaRequiredForAll: false, expiryAlertDays: [3], alertEmailEnabled: false });
    expect((await runTenantAlerts(ctx.tenantId)).created).toBe(0);
  });

  it("la moneda base no cambia si ya hay inventario valorizado", async () => {
    const ctx = await setup();
    const p = (await createProduct(ctx.owner, { sku: "P1", name: "Producto 1" })).id;
    await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: ctx.warehouseId, productId: p, quantity: "1", unit: "UND" });
    await expect(updateTenantSettings(ctx.owner, { baseCurrency: "VES", adjustmentApprovalThreshold: "100", allowNegativeStock: false, mfaRequiredForAll: false, expiryAlertDays: [7], alertEmailEnabled: false })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
