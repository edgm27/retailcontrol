import { randomUUID } from "node:crypto";
import { prisma, withContext } from "@rc/db";
import {
  addProductUnit,
  approveStockCount,
  cancelTransfer,
  createBranch,
  createProduct,
  createStockCount,
  createTransfer,
  createWarehouse,
  decideAdjustment,
  getInventoryDashboard,
  getProductStock,
  listExpiringLots,
  listKardex,
  listStock,
  postStockMovement,
  receiveTransfer,
  recordCountQuantities,
  requestAdjustment,
  reverseOperation,
  sendTransfer,
  setLotStatus,
  submitStockCount,
  type TenantActor,
} from "@rc/domain";
import { beforeAll, describe, expect, it } from "vitest";
import { actorFor, addMember, createCompany, createUser } from "./helpers";

const key = () => `k-${randomUUID()}`;

async function setup(plan = "PROFESIONAL") {
  const o = await createUser("inv-dueno");
  const company = await createCompany(o, plan, "Abastos Inventario");
  const owner = await actorFor(o, company.tenant.id);
  const mk = async (role: TenantActor["role"]) => {
    const u = await createUser(role.toLowerCase());
    await addMember(company.tenant.id, u, role);
    return actorFor(u, company.tenant.id);
  };
  return { owner, tenantId: company.tenant.id, warehouseId: company.warehouseId, branchId: company.branchId, mk };
}

const stockOf = async (a: TenantActor, productId: string) =>
  (await listStock(a, { search: undefined, pageSize: 200 })).items.find((i) => i.productId === productId);

describe("Inventario — libro, idempotencia y concurrencia", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let harina: string;

  beforeAll(async () => {
    ctx = await setup();
    harina = (await createProduct(ctx.owner, { sku: "HARINA", name: "Harina 1 kg", minStock: "50" })).id;
    await addProductUnit(ctx.owner, harina, { code: "BULTO", name: "Bulto de 20", factorToBase: "20" });
  });

  it("presentaciones: recibir 2 BULTO suma 40 UND al saldo", async () => {
    const r = await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: ctx.warehouseId, productId: harina, quantity: "2", unit: "BULTO", unitCost: "30" });
    expect(r.movements[0]!.quantity).toBe("40");
    expect((await stockOf(ctx.owner, harina))?.onHand).toBe("40");
  });

  it("aceptación 4: la misma clave de idempotencia no duplica la recepción (secuencial y simultánea)", async () => {
    const k = key();
    const input = { idempotencyKey: k, type: "RECEIPT" as const, warehouseId: ctx.warehouseId, productId: harina, quantity: "10", unit: "UND" };
    const first = await postStockMovement(ctx.owner, input);
    const again = await postStockMovement(ctx.owner, input);
    expect(again.operationId).toBe(first.operationId);
    expect(again.replayed).toBe(true);

    const k2 = key();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => postStockMovement(ctx.owner, { ...input, idempotencyKey: k2 })),
    );
    expect(new Set(results.map((r) => r.operationId)).size).toBe(1);
    expect((await stockOf(ctx.owner, harina))?.onHand).toBe("60"); // 40 + 10 + 10 (una sola vez cada clave)
    const movements = await withContext({ tenantId: ctx.tenantId }, (tx) => tx.stockMovement.count({ where: { productId: harina } }));
    expect(movements).toBe(3);
  });

  it("la misma clave con datos distintos es rechazada", async () => {
    const k = key();
    await postStockMovement(ctx.owner, { idempotencyKey: k, type: "RECEIPT", warehouseId: ctx.warehouseId, productId: harina, quantity: "1", unit: "UND" });
    await expect(
      postStockMovement(ctx.owner, { idempotencyKey: k, type: "RECEIPT", warehouseId: ctx.warehouseId, productId: harina, quantity: "99", unit: "UND" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("aceptación 5: salidas simultáneas no dejan stock negativo", async () => {
    const p = (await createProduct(ctx.owner, { sku: "ARROZ", name: "Arroz" })).id;
    await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: ctx.warehouseId, productId: p, quantity: "10", unit: "UND" });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        postStockMovement(ctx.owner, { idempotencyKey: key(), type: "ISSUE", warehouseId: ctx.warehouseId, productId: p, quantity: "3", unit: "UND" }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(3);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected.every((r) => r.reason.code === "INSUFFICIENT_STOCK")).toBe(true);
    expect((await stockOf(ctx.owner, p))?.onHand).toBe("1");
  });

  it("costo promedio ponderado: 10 a 2 + 10 a 4 = 3; la salida se valoriza a 3", async () => {
    const p = (await createProduct(ctx.owner, { sku: "ACEITE", name: "Aceite" })).id;
    await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: ctx.warehouseId, productId: p, quantity: "10", unit: "UND", unitCost: "2" });
    await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: ctx.warehouseId, productId: p, quantity: "10", unit: "UND", unitCost: "4,00" });
    expect((await stockOf(ctx.owner, p))?.avgCost).toBe("3");
    const out = await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "ISSUE", warehouseId: ctx.warehouseId, productId: p, quantity: "5", unit: "UND" });
    const m = await withContext({ tenantId: ctx.tenantId }, (tx) => tx.stockMovement.findUnique({ where: { id: out.movements[0]!.id } }));
    expect(m?.unitCost?.toString()).toBe("3");
    expect((await stockOf(ctx.owner, p))?.value).toBe("45");
  });

  it("los movimientos son inmutables (ni la app ni un error de código pueden editarlos o borrarlos)", async () => {
    await expect(withContext({ tenantId: ctx.tenantId }, (tx) => tx.stockMovement.updateMany({ data: { reason: "x" } }))).rejects.toThrow();
    await expect(withContext({ tenantId: ctx.tenantId }, (tx) => tx.stockMovement.deleteMany({}))).rejects.toThrow();
  });

  it("reverso: crea movimientos opuestos, restablece el saldo y no se puede repetir", async () => {
    const p = (await createProduct(ctx.owner, { sku: "SAL", name: "Sal" })).id;
    const r = await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: ctx.warehouseId, productId: p, quantity: "7", unit: "UND", unitCost: "1" });
    await reverseOperation(ctx.owner, r.operationId, "Recepción cargada por error");
    expect((await stockOf(ctx.owner, p))?.onHand).toBe("0");
    await expect(reverseOperation(ctx.owner, r.operationId, "Otra vez")).rejects.toMatchObject({ code: "CONFLICT" });
    const k = await listKardex(ctx.owner, { productId: p });
    expect(k.items.map((i) => i.type)).toEqual(["REVERSAL", "RECEIPT"]);
    expect(k.items[0]!.balance).toBe("0");
    expect(k.items[1]!.reversed).toBe(true);
  });

  it("Kardex con saldo acumulado y stock bajo en el tablero", async () => {
    const k = await listKardex(ctx.owner, { productId: harina });
    expect(k.items[0]!.balance).toBe("61"); // 40 + 10 + 10 + 1
    const dash = await getInventoryDashboard(ctx.owner);
    expect(Number(dash.inventoryValue)).toBeGreaterThan(0);
    expect(dash.recent.length).toBeGreaterThan(0);
  });
});

describe("Lotes, vencimientos y FEFO (aceptación 6)", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let leche: string;
  const lots: Record<string, string> = {};

  beforeAll(async () => {
    ctx = await setup();
    leche = (await createProduct(ctx.owner, { sku: "LECHE", name: "Leche UHT 1L", requiresExpiry: true })).id;
    const receive = async (lotNumber: string, expiresAt: string, quantity: string, now?: Date) => {
      const r = await postStockMovement(
        ctx.owner,
        { idempotencyKey: key(), type: "RECEIPT", warehouseId: ctx.warehouseId, productId: leche, quantity, unit: "UND", lotNumber, expiresAt },
        now,
      );
      lots[lotNumber] = r.movements[0]!.lotId!;
    };
    const plus = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
    // VENCIDO: se recibió en el pasado con un vencimiento que ya pasó.
    await receive("L-VENCIDO", "2026-01-05", "100", new Date("2026-01-01T12:00:00Z"));
    await receive("L-CUARENTENA", plus(2), "100");
    await receive("L-A", plus(20), "5");
    await receive("L-B", plus(10), "5");
    await receive("L-SIN-PRISA", plus(90), "50");
    await setLotStatus(ctx.owner, lots["L-CUARENTENA"]!, "QUARANTINE", "Revisión de calidad");
  });

  it("exige lote y vencimiento en productos que lo requieren; no recibe lotes vencidos", async () => {
    await expect(postStockMovement(ctx.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: ctx.warehouseId, productId: leche, quantity: "1", unit: "UND" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(postStockMovement(ctx.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: ctx.warehouseId, productId: leche, quantity: "1", unit: "UND", lotNumber: "X1" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(postStockMovement(ctx.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: ctx.warehouseId, productId: leche, quantity: "1", unit: "UND", lotNumber: "X2", expiresAt: "2020-01-01" })).rejects.toThrow(/vencido/);
  });

  it("FEFO toma primero el que vence antes y salta vencidos y en cuarentena", async () => {
    const r = await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "ISSUE", warehouseId: ctx.warehouseId, productId: leche, quantity: "8", unit: "UND" });
    expect(r.movements.map((m) => [m.lotId, m.quantity])).toEqual([
      [lots["L-B"], "-5"],
      [lots["L-A"], "-3"],
    ]);
  });

  it("si solo quedan lotes no despachables, la salida falla aunque haya existencia física", async () => {
    // Quedan: L-A 2, L-SIN-PRISA 50 despachables; vencido 100 y cuarentena 100 no.
    await expect(
      postStockMovement(ctx.owner, { idempotencyKey: key(), type: "ISSUE", warehouseId: ctx.warehouseId, productId: leche, quantity: "60", unit: "UND" }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  });

  it("no permite despachar explícitamente un lote vencido o en cuarentena", async () => {
    for (const l of ["L-VENCIDO", "L-CUARENTENA"]) {
      await expect(
        postStockMovement(ctx.owner, { idempotencyKey: key(), type: "ISSUE", warehouseId: ctx.warehouseId, productId: leche, quantity: "1", unit: "UND", lotId: lots[l] }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    }
  });

  it("una corrección autorizada (merma) sí puede sacar mercancía de un lote vencido", async () => {
    const r = await requestAdjustment(ctx.owner, { warehouseId: ctx.warehouseId, productId: leche, lotId: lots["L-VENCIDO"], direction: "OUT", kind: "WASTE", quantity: "100", unit: "UND", reason: "Destrucción de lote vencido" });
    expect(r.status).toBe("APPLIED"); // costo 0 => bajo el umbral
    const stock = await getProductStock(ctx.owner, leche);
    expect(stock.find((s) => s.lotId === lots["L-VENCIDO"])).toBeUndefined();
  });

  it("alertas de vencimiento: lista lotes en el horizonte con días restantes", async () => {
    const list = await listExpiringLots(ctx.owner, { days: 30 });
    expect(list.map((l) => l.lotNumber)).toEqual(["L-CUARENTENA", "L-B", "L-A"].filter((n) => n !== "L-B"));
    expect(list.every((l) => l.daysLeft <= 30)).toBe(true);
  });

  it("empates de vencimiento se resuelven de forma determinista (fecha de recepción)", async () => {
    const p = (await createProduct(ctx.owner, { sku: "YOGUR", name: "Yogur", requiresExpiry: true })).id;
    const exp = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
    const first = await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: ctx.warehouseId, productId: p, quantity: "3", unit: "UND", lotNumber: "Y-1", expiresAt: exp });
    await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: ctx.warehouseId, productId: p, quantity: "3", unit: "UND", lotNumber: "Y-2", expiresAt: exp });
    const out = await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "ISSUE", warehouseId: ctx.warehouseId, productId: p, quantity: "2", unit: "UND" });
    expect(out.movements[0]!.lotId).toBe(first.movements[0]!.lotId);
  });
});

describe("Ajustes y conteos con aprobación (aceptación 7)", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let manager: TenantActor;
  let manager2: TenantActor;
  let p: string;

  beforeAll(async () => {
    ctx = await setup();
    manager = await ctx.mk("MANAGER");
    manager2 = await ctx.mk("MANAGER");
    p = (await createProduct(ctx.owner, { sku: "CAFE", name: "Café 500 g" })).id;
    await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: ctx.warehouseId, productId: p, quantity: "100", unit: "UND", unitCost: "5" });
  });

  it("ajuste bajo el umbral (100) se aplica de inmediato", async () => {
    const r = await requestAdjustment(manager, { warehouseId: ctx.warehouseId, productId: p, direction: "OUT", quantity: "2", unit: "UND", reason: "Empaque roto" });
    expect(r).toMatchObject({ status: "APPLIED", estimatedValue: "10" });
    expect((await stockOf(ctx.owner, p))?.onHand).toBe("98");
  });

  it("ajuste sobre el umbral queda pendiente; quien lo pide no puede aprobarlo; otro sí", async () => {
    const r = await requestAdjustment(manager, { warehouseId: ctx.warehouseId, productId: p, direction: "OUT", kind: "WASTE", quantity: "30", unit: "UND", reason: "Humedad en depósito" });
    expect(r).toMatchObject({ status: "PENDING", estimatedValue: "150" });
    expect((await stockOf(ctx.owner, p))?.onHand).toBe("98");
    await expect(decideAdjustment(manager, r.id, "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await decideAdjustment(manager2, r.id, "APPROVE", "Verificado");
    expect((await stockOf(ctx.owner, p))?.onHand).toBe("68");
    await expect(decideAdjustment(ctx.owner, r.id, "REJECT")).rejects.toMatchObject({ code: "CONFLICT" });
    const audit = await withContext({ tenantId: ctx.tenantId }, (tx) => tx.auditEvent.findMany({ where: { entityId: r.id }, orderBy: { createdAt: "asc" } }));
    expect(audit.map((a) => a.action)).toEqual(["adjustment.requested", "adjustment.approved"]);
  });

  it("un almacenista no puede ajustar existencias (aceptación 3, a nivel de servicio)", async () => {
    const clerk = await ctx.mk("WAREHOUSE");
    await expect(requestAdjustment(clerk, { warehouseId: ctx.warehouseId, productId: p, direction: "IN", quantity: "1", unit: "UND", reason: "Intento sin permiso" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const ro = await ctx.mk("READONLY");
    await expect(postStockMovement(ro, { idempotencyKey: key(), type: "ISSUE", warehouseId: ctx.warehouseId, productId: p, quantity: "1", unit: "UND" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("conteo con diferencia grande: pendiente, aprobación por otro usuario, ajuste auditado", async () => {
    const clerk = await ctx.mk("WAREHOUSE");
    const count = await createStockCount(clerk, { warehouseId: ctx.warehouseId, productIds: [p] });
    const full = await withContext({ tenantId: ctx.tenantId }, (tx) => tx.stockCountLine.findMany({ where: { countId: count.id } }));
    expect(full).toHaveLength(1);
    expect(full[0]!.expected.toString()).toBe("68");
    await expect(submitStockCount(clerk, count.id)).rejects.toMatchObject({ code: "VALIDATION" }); // falta contar
    await recordCountQuantities(clerk, count.id, [{ lineId: full[0]!.id, counted: "40" }]);
    const sub = await submitStockCount(clerk, count.id);
    expect(sub).toMatchObject({ status: "PENDING_APPROVAL", differenceValue: "140" });
    await expect(approveStockCount(clerk, count.id)).rejects.toMatchObject({ code: "FORBIDDEN" }); // sin permiso
    await approveStockCount(manager, count.id);
    expect((await stockOf(ctx.owner, p))?.onHand).toBe("40");
    const k = await listKardex(ctx.owner, { productId: p });
    expect(k.items[0]).toMatchObject({ type: "COUNT_ADJUSTMENT", quantity: "-28", balance: "40" });
    const audit = await withContext({ tenantId: ctx.tenantId }, (tx) => tx.auditEvent.findMany({ where: { entityId: count.id } }));
    expect(audit.map((a) => a.action).sort()).toEqual(["count.approved", "count.created", "count.submitted_for_approval"]);
  });
});

describe("Transferencias entre almacenes", () => {
  it("borrador → enviada (sale con FEFO) → recibida; cancelar una enviada devuelve al origen", async () => {
    const ctx = await setup();
    const b2 = await createBranch(ctx.owner, { code: "S2", name: "Sucursal Este" });
    const w2 = await createWarehouse(ctx.owner, { branchId: b2.id, code: "ALM-02", name: "Almacén Este" });
    const p = (await createProduct(ctx.owner, { sku: "QUESO", name: "Queso", baseUnit: "KG", requiresExpiry: true })).id;
    const exp = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
    await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: ctx.warehouseId, productId: p, quantity: "5", unit: "KG", lotNumber: "Q-TARDE", expiresAt: exp(30) });
    await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: ctx.warehouseId, productId: p, quantity: "2500", unit: "G", lotNumber: "Q-PRONTO", expiresAt: exp(5) });

    const t = await createTransfer(ctx.owner, { fromWarehouseId: ctx.warehouseId, toWarehouseId: w2.id, lines: [{ productId: p, quantity: "3", unit: "KG" }] });
    await sendTransfer(ctx.owner, t.id);
    const mid = await getProductStock(ctx.owner, p);
    expect(mid.find((s) => s.lotNumber === "Q-PRONTO" && s.warehouseId === ctx.warehouseId)).toBeUndefined(); // 2,5 kg salieron primero
    expect(mid.find((s) => s.lotNumber === "Q-TARDE" && s.warehouseId === ctx.warehouseId)?.onHand).toBe("4.5");
    await receiveTransfer(ctx.owner, t.id);
    const after = await getProductStock(ctx.owner, p);
    expect(after.filter((s) => s.warehouseId === w2.id).map((s) => [s.lotNumber, s.onHand])).toEqual([
      ["Q-PRONTO", "2.5"],
      ["Q-TARDE", "0.5"],
    ]);
    await expect(receiveTransfer(ctx.owner, t.id)).rejects.toMatchObject({ code: "CONFLICT" });

    const t2 = await createTransfer(ctx.owner, { fromWarehouseId: ctx.warehouseId, toWarehouseId: w2.id, lines: [{ productId: p, quantity: "1", unit: "KG" }] });
    await sendTransfer(ctx.owner, t2.id);
    await cancelTransfer(ctx.owner, t2.id, "Camión no disponible");
    const back = await getProductStock(ctx.owner, p);
    expect(back.find((s) => s.lotNumber === "Q-TARDE" && s.warehouseId === ctx.warehouseId)?.onHand).toBe("4.5");
  });

  it("plan Básico: transferencias no incluidas (validado en el servidor)", async () => {
    const ctx = await setup("BASICO");
    const w2 = await createWarehouse(ctx.owner, { branchId: ctx.branchId, code: "ALM-02", name: "Depósito" });
    const p = (await createProduct(ctx.owner, { sku: "X", name: "Producto X" })).id;
    await expect(
      createTransfer(ctx.owner, { fromWarehouseId: ctx.warehouseId, toWarehouseId: w2.id, lines: [{ productId: p, quantity: "1", unit: "UND" }] }),
    ).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
  });
});

describe("Aislamiento del inventario entre empresas", () => {
  it("una empresa no ve ni usa lotes, saldos o movimientos de otra", async () => {
    const a = await setup();
    const b = await setup();
    const pa = (await createProduct(a.owner, { sku: "MISMO", name: "Producto A", requiresExpiry: true })).id;
    const pb = (await createProduct(b.owner, { sku: "MISMO", name: "Producto B", requiresExpiry: true })).id;
    const exp = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    const rb = await postStockMovement(b.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: b.warehouseId, productId: pb, quantity: "9", unit: "UND", lotNumber: "L1", expiresAt: exp });
    // A no puede usar el lote ni el almacén ni el producto de B.
    await expect(postStockMovement(a.owner, { idempotencyKey: key(), type: "ISSUE", warehouseId: a.warehouseId, productId: pa, quantity: "1", unit: "UND", lotId: rb.movements[0]!.lotId! })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(postStockMovement(a.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: b.warehouseId, productId: pa, quantity: "1", unit: "UND", lotNumber: "Z", expiresAt: exp })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listExpiringLots(a.owner, { days: 365 })).toHaveLength(0);
    expect((await listStock(a.owner)).items.find((i) => i.sku === "MISMO")?.onHand).toBe("0");
    // Aunque el código lo intente directo en la BD, el trigger impide mezclar lotes de otra empresa.
    await expect(
      withContext({ tenantId: a.tenantId, userId: a.owner.userId }, (tx) =>
        tx.stockMovement.create({
          data: { tenantId: a.tenantId, operationId: randomUUID(), type: "RECEIPT", warehouseId: a.warehouseId, productId: pa, lotId: rb.movements[0]!.lotId!, quantity: 1, enteredQuantity: 1, enteredUnit: "UND", actorUserId: a.owner.userId },
        }),
      ),
    ).rejects.toThrow();
    expect(await prisma.stockBalance.count()).toBe(0); // sin contexto: nada visible
  });
});

describe("Tablero analítico", () => {
  it("calcula KPI, series diarias, top de productos, vencimientos por horizonte y compras por período", async () => {
    const { getDashboardAnalytics } = await import("@rc/domain");
    const ctx = await setup();
    const p = (await createProduct(ctx.owner, { sku: "KPI-1", name: "Producto KPI", minStock: "100", requiresExpiry: true })).id;
    const caracas = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
    const exp = (d: number) => new Date(Date.parse(`${caracas}T12:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
    await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: ctx.warehouseId, productId: p, quantity: "10", unit: "UND", unitCost: "2", lotNumber: "K1", expiresAt: exp(5) });
    await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "RECEIPT", warehouseId: ctx.warehouseId, productId: p, quantity: "10", unit: "UND", unitCost: "2", lotNumber: "K2", expiresAt: exp(45) });
    await postStockMovement(ctx.owner, { idempotencyKey: key(), type: "ISSUE", warehouseId: ctx.warehouseId, productId: p, quantity: "4", unit: "UND" });
    const a = await getDashboardAnalytics(ctx.owner, { days: 7 });
    expect(a.kpis).toMatchObject({ inventoryValue: 32, activeProducts: 1, productsWithStock: 1, lowStock: 1, expiringLots: 1, expiringValue: 12 });
    expect(a.kpis.inbound.value).toBe(40);
    expect(a.kpis.outbound.value).toBe(8);
    expect(a.kpis.coverageDays).toBe(28); // 32 / (8 / 7 días)
    expect(a.daily).toHaveLength(7);
    expect(a.daily.at(-1)).toMatchObject({ date: caracas, inbound: 40, outbound: 8, inventory: 32 });
    expect(a.daily[0]!.inventory).toBe(0); // antes de los movimientos de hoy
    expect(a.topProducts[0]).toMatchObject({ sku: "KPI-1", value: 32 });
    expect(a.expiryBuckets.find((b) => b.key === "d7")).toMatchObject({ lots: 1, value: 12 });
    expect(a.expiryBuckets.find((b) => b.key === "d60")).toMatchObject({ lots: 1, value: 20 });
    // Otra empresa no ve nada.
    const other = await setup();
    expect((await getDashboardAnalytics(other.owner)).kpis.inventoryValue).toBe(0);
  });
});
