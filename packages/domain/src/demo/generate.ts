import { randomBytes, randomUUID } from "node:crypto";
import { withContext } from "@rc/db";
import { isDomainError } from "../errors";
import { recordAudit } from "../services/audit";
import { createBranch, createWarehouse } from "../services/branches";
import { runTenantAlerts } from "../services/alerts";
import { createProduct } from "../services/products";
import { createTenantWithOwner, resolveTenantAccess } from "../services/tenants";
import { createMemberUser } from "../services/user-admin";
import { addProductBarcode, addProductUnit, setLotStatus, updateProductInventorySettings } from "../services/inventory/catalog";
import { demoClock } from "../services/inventory/core";
import { requestAdjustment } from "../services/inventory/adjustments";
import { approveStockCount, createStockCount, getStockCount, recordCountQuantities, submitStockCount } from "../services/inventory/counts";
import { postStockMovement } from "../services/inventory/movements";
import { createTransfer, receiveTransfer, sendTransfer } from "../services/inventory/transfers";
import { approvePurchaseOrder, createPurchaseOrder } from "../services/purchasing/purchase-orders";
import { recordExchangeRate } from "../services/purchasing/rates";
import { receiveGoods } from "../services/purchasing/receipts";
import { createSupplier } from "../services/purchasing/suppliers";
import type { TenantActor, UserActor } from "../services/types";
import { DEMO_CATALOG, DEMO_SUPPLIERS, demoEan, type DemoItem } from "./catalog";

/*
 * Empresa de DEMOSTRACIÓN con datos ficticios para probar todas las funciones:
 * ~125 productos (con presentaciones y códigos de barras), proveedores, tasas, recepciones con lotes
 * y vencimientos, ventas, mermas, transferencias, conteos, órdenes de compra y alertas.
 * Usa los MISMOS servicios que la app (mismas reglas, auditoría e invariantes); la historia se
 * fecha en el pasado con un reloj simulado. Se crea en una empresa NUEVA: no toca datos existentes.
 */

export const DEMO_COMPANY_NAME = "Demo · Abastos y Ferretería La Esquina (datos ficticios)";

export interface DemoOptions {
  /** Días de historia (por defecto 60). */
  days?: number;
  /** Máximo de productos (por defecto todos ≈125). */
  productLimit?: number;
  onProgress?: (message: string) => void;
}

export interface DemoResult {
  tenantId: string;
  products: number;
  receipts: number;
  sales: number;
  managerEmail: string;
}

// Generador pseudoaleatorio determinista (mismos datos en cada ejecución).
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const caracasDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(d);
const key = () => `demo-${randomUUID()}`;

interface DemoProduct {
  id: string;
  sku: string;
  item: DemoItem;
  shelfLife: number | null;
  supplier: number;
  warehouse: "principal" | "deposito";
  index: number;
}

async function actorOf(userId: string, email: string, tenantId: string): Promise<TenantActor> {
  const a = await resolveTenantAccess(userId, tenantId);
  if (!a) throw new Error("Sin acceso a la empresa de demostración");
  return { userId, email, tenantId, membershipId: a.membershipId, role: a.role, branchIds: a.branchIds };
}

export async function generateDemoCompany(user: UserActor, opts: DemoOptions = {}): Promise<DemoResult> {
  const days = Math.min(Math.max(opts.days ?? 60, 7), 120);
  const log = opts.onProgress ?? (() => undefined);
  const rand = rng(20261027);
  const realNow = new Date();
  const today = caracasDate(realNow);
  /** Mediodía en Caracas (16:00 UTC) del día `ago` días atrás, con algo de variación en la hora. */
  const at = (ago: number, hour = 12) => new Date(Date.parse(`${today}T00:00:00Z`) - ago * 86_400_000 + (hour + 4) * 3_600_000);
  const dateAgo = (ago: number) => caracasDate(at(ago));
  const plusDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

  // 1. Empresa, sucursales, almacenes y un segundo usuario (aprobaciones con segregación).
  log("Creando empresa…");
  const created = await createTenantWithOwner(user, { name: `${DEMO_COMPANY_NAME.replace(" (datos ficticios)", "")} (generando datos…)` }, { planCode: "PROFESIONAL", trialDays: 30 });
  const tenantId = created.tenant.id;
  try {
    return await fill();
  } catch (e) {
    await withContext({ tenantId }, (tx) => tx.tenant.update({ where: { id: tenantId }, data: { name: `${DEMO_COMPANY_NAME.replace(" (datos ficticios)", "")} (incompleta: error al generar)` } })).catch(() => undefined);
    throw e;
  }

  async function fill(): Promise<DemoResult> {
    const owner = await actorOf(user.userId, user.email, tenantId);
    const principal = created.warehouseId;
    const deposito = (await createWarehouse(owner, { branchId: created.branchId, code: "DEP-01", name: "Depósito de ferretería" })).id;
    const centro = await createBranch(owner, { code: "CENTRO", name: "Sucursal Centro" });
    const almCentro = (await createWarehouse(owner, { branchId: centro.id, code: "ALM-CEN", name: "Almacén Centro" })).id;
    const managerEmail = `gerente.demo.${tenantId.slice(0, 8)}@example.com`;
    // Clave aleatoria que nadie conoce: para entrar con este usuario, asígnele una clave temporal en Usuarios.
    await createMemberUser(owner, { email: managerEmail, name: "Gerente Demo (ficticio)", role: "MANAGER", tempPassword: `Demo-${randomBytes(12).toString("base64url")}` });
    const managerUser = await withContext({ tenantId }, (tx) => tx.membership.findFirstOrThrow({ where: { tenantId, role: "MANAGER" }, select: { userId: true } }));
    const manager = await actorOf(managerUser.userId, managerEmail, tenantId);

    // 2. Proveedores y catálogo.
    log("Creando proveedores y productos…");
    const suppliers: string[] = [];
    for (const s of DEMO_SUPPLIERS) {
      suppliers.push((await createSupplier(owner, { name: s.name, rif: s.rif, paymentTermsDays: s.paymentTermsDays, contactName: "Contacto ficticio" })).id);
    }
    const products: DemoProduct[] = [];
    let n = 0;
    for (const cat of DEMO_CATALOG) {
      // Con límite, se toma una parte de cada categoría (todas las funciones quedan con datos).
      const perCategory = opts.productLimit ? Math.ceil(opts.productLimit / DEMO_CATALOG.length) : Infinity;
      for (const [i, item] of cat.items.entries()) {
        if (i >= perCategory || (opts.productLimit && products.length >= opts.productLimit)) break;
        n++;
        const sku = `${cat.prefix}-${String(i + 1).padStart(3, "0")}`;
        const perishable = cat.shelfLife !== null;
        const p = await createProduct(owner, {
          sku,
          name: item.name,
          baseUnit: item.unit,
          lotTracking: perishable,
          requiresExpiry: perishable,
          minStock: item.minStock,
        });
        if (item.pack) {
          await addProductUnit(owner, p.id, { code: item.pack.code, name: item.pack.name, factorToBase: String(item.pack.factor) });
          await addProductBarcode(owner, p.id, { code: demoEan(100_000 + n), unitCode: item.pack.code });
        }
        if (item.unit === "UND") await addProductBarcode(owner, p.id, { code: demoEan(n) });
        products.push({ id: p.id, sku, item, shelfLife: cat.shelfLife, supplier: cat.supplier, warehouse: cat.prefix === "FER" ? "deposito" : "principal", index: n });
      }
    }
    const whOf = (p: DemoProduct) => (p.warehouse === "deposito" ? deposito : principal);

    // 3. Tasas Bs./USD ficticias, una por día.
    log("Registrando tasas de cambio ficticias…");
    const rates = new Map<string, number>();
    for (let ago = days + 1; ago >= 0; ago--) {
      const r = Math.round((38 + (days + 1 - ago) * 0.12 + Math.sin(ago / 3) * 0.3) * 10_000) / 10_000;
      rates.set(dateAgo(ago), r);
      await recordExchangeRate(owner, { rate: String(r), effectiveDate: dateAgo(ago), source: "INTERNAL", sourceReference: "Tasa ficticia de demostración" });
    }

    // 4. Historia día por día: recepciones semanales por proveedor, ventas, mermas y transferencias.
    let receipts = 0;
    let sales = 0;
    let lotSeq = 1;
    const round = (v: number, unit: string) => (unit === "UND" ? Math.max(1, Math.round(v)) : Math.max(0.5, Math.round(v * 10) / 10));

    const receive = async (ago: number, supplier: number, items: DemoProduct[], coverDays: number) => {
      const date = dateAgo(ago);
      const ves = supplier === 1 || supplier === 2 ? (ago % 2 === 0 ? "VES" : "USD") : "USD";
      const rate = rates.get(date) ?? 40;
      for (const wh of ["principal", "deposito"] as const) {
        const group = items.filter((p) => p.warehouse === wh);
        if (!group.length) continue;
        const lines = group.map((p) => {
          // Algunos perecederos se compran de más: quedarán lotes por vencer y vencidos con existencia.
          const over = p.shelfLife !== null && p.shelfLife <= 30 && p.index % 7 === 0 ? 1.6 : 1;
          const need = p.item.demand * coverDays * (0.85 + rand() * 0.4) * over;
          const cost = p.item.cost * (0.95 + rand() * 0.1);
          const usePack = p.item.pack && need >= p.item.pack.factor;
          const qty = usePack ? Math.ceil(need / p.item.pack!.factor) : round(need, p.item.unit);
          const unitCost = usePack ? cost * p.item.pack!.factor : cost;
          const price = ves === "VES" ? unitCost * rate : unitCost;
          return {
            productId: p.id,
            quantity: String(qty),
            unit: usePack ? p.item.pack!.code : p.item.unit,
            unitPrice: price.toFixed(2),
            ...(p.shelfLife !== null
              ? { lotNumber: `L${date.replace(/-/g, "").slice(2)}-${String(lotSeq++).padStart(3, "0")}`, expiresAt: plusDays(date, Math.round(p.shelfLife * (0.8 + rand() * 0.4))) }
              : {}),
          };
        });
        await demoClock.run(at(ago, 9), () =>
          receiveGoods(
            owner,
            {
              idempotencyKey: key(),
              supplierId: suppliers[supplier]!,
              warehouseId: wh === "deposito" ? deposito : principal,
              currency: ves as "USD" | "VES",
              supplierInvoice: `F-${String(1000 + receipts).padStart(6, "0")}`,
              additionalCosts: receipts % 5 === 0 ? (ves === "VES" ? (8 * rate).toFixed(2) : "8") : undefined,
              lines,
            },
            at(ago, 9),
          ),
        );
        receipts++;
      }
    };

    log("Generando historia de compras y ventas…");
    // Inventario inicial (cubre ~3 semanas) y reposición semanal escalonada por proveedor.
    for (let s = 0; s < suppliers.length; s++) await receive(days, s, products.filter((p) => p.supplier === s), 21);
    for (let ago = days - 1; ago >= 0; ago--) {
      const date = dateAgo(ago);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      for (let s = 0; s < suppliers.length; s++) {
        if ((ago + s) % 7 === 0 && ago > 2) {
          // Algunos productos no se reponen a tiempo: habrá stock bajo.
          const items = products.filter((p) => p.supplier === s && !(p.index % 9 === 0 && ago < 14));
          await receive(ago, s, items, 8);
        }
      }
      // Ventas: cada producto vende cada 3 días (escalonado) la demanda de esos días; fines de semana +30 %.
      for (const p of products) {
        if ((ago + p.index) % 3 !== 0) continue;
        const factor = (weekday === 0 || weekday === 6 ? 1.3 : 1) * (0.6 + rand() * 0.8);
        const qty = round(p.item.demand * 3 * factor, p.item.unit);
        try {
          await demoClock.run(at(ago, 10 + (p.index % 8)), () =>
            postStockMovement(owner, { idempotencyKey: key(), type: "ISSUE", warehouseId: whOf(p), productId: p.id, quantity: String(qty), unit: p.item.unit, reason: "Venta del día" }, at(ago, 10 + (p.index % 8))),
          );
          sales++;
        } catch (e) {
          if (!isDomainError(e)) throw e; // sin existencia suficiente: ese día no se vendió
        }
      }
      // Mermas semanales en perecederos (bajo el umbral: se aplican de inmediato).
      if (ago % 7 === 3) {
        for (const p of products.filter((x) => x.shelfLife !== null && x.shelfLife <= 30).slice(ago % 5, (ago % 5) + 2)) {
          const qty = p.item.unit === "UND" ? 2 : 0.5;
          // La merma sale del lote más antiguo con existencia suficiente.
          const bal = await withContext({ tenantId }, (tx) =>
            tx.stockBalance.findFirst({ where: { tenantId, productId: p.id, warehouseId: whOf(p), lotId: { not: null }, onHand: { gte: qty } }, include: { lot: true }, orderBy: { lot: { receivedAt: "asc" } } }),
          );
          if (!bal?.lotId) continue;
          try {
            await demoClock.run(at(ago, 19), () =>
              requestAdjustment(owner, { warehouseId: whOf(p), productId: p.id, lotId: bal.lotId!, direction: "OUT", kind: "WASTE", quantity: String(qty), unit: p.item.unit, reason: "Producto dañado o vencido" }),
            );
          } catch (e) {
            if (!isDomainError(e)) throw e;
          }
        }
      }
      // Transferencia a la Sucursal Centro cada 10 días (no perecederos de la sede principal).
      if (ago % 10 === 5 && ago > 1) {
        const lines = products.filter((p) => p.warehouse === "principal" && p.shelfLife === null).slice(0, 5)
          .map((p) => ({ productId: p.id, quantity: String(round(p.item.demand * 2, p.item.unit)), unit: p.item.unit }));
        if (lines.length) {
          try {
            const t = await createTransfer(owner, { fromWarehouseId: principal, toWarehouseId: almCentro, note: "Reposición sucursal", lines });
            await demoClock.run(at(ago, 15), () => sendTransfer(owner, t.id, at(ago, 15)));
            await demoClock.run(at(ago - 1, 9), () => receiveTransfer(owner, t.id, at(ago - 1, 9)));
          } catch (e) {
            if (!isDomainError(e)) throw e;
          }
        }
      }
      if (ago % 10 === 0) log(`Historia: faltan ${ago} días…`);
    }

    // 5. Estado "de hoy" para probar flujos pendientes.
    log("Creando órdenes, conteos y pendientes…");
    const poLines = (s: number, k: number) =>
      products.filter((p) => p.supplier === s).slice(0, k).map((p) => ({
        productId: p.id,
        quantity: String(p.item.pack ? p.item.pack.factor * 4 : round(p.item.demand * 10, p.item.unit)),
        unit: p.item.unit,
        unitPrice: p.item.cost.toFixed(2),
        taxRate: "16",
      }));
    const po1 = await createPurchaseOrder(owner, { supplierId: suppliers[0]!, warehouseId: principal, currency: "USD", expectedDate: plusDays(today, 3), notes: "Pedido semanal de víveres", lines: poLines(0, 8) });
    await approvePurchaseOrder(manager, po1.id);
    await createPurchaseOrder(owner, { supplierId: suppliers[3]!, warehouseId: principal, currency: "USD", notes: "Borrador de limpieza (por aprobar)", lines: poLines(3, 6) });
    const po3 = await createPurchaseOrder(owner, { supplierId: suppliers[5]!, warehouseId: deposito, currency: "USD", expectedDate: plusDays(today, 1), notes: "Material eléctrico", lines: poLines(5, 6) });
    await approvePurchaseOrder(manager, po3.id);
    // Recepción parcial de la orden de ferretería (la mitad de las primeras 3 líneas).
    const po3Lines = await withContext({ tenantId }, (tx) => tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: po3.id }, orderBy: { id: "asc" }, take: 3 }));
    await receiveGoods(owner, {
      idempotencyKey: key(),
      purchaseOrderId: po3.id,
      supplierId: suppliers[5]!,
      warehouseId: deposito,
      currency: "USD",
      supplierInvoice: "F-PARCIAL-001",
      lines: po3Lines.map((l) => ({ purchaseOrderLineId: l.id, productId: l.productId, quantity: l.enteredQuantity.dividedBy(2).toDecimalPlaces(0).toString(), unit: l.enteredUnit, unitPrice: l.unitPrice.toString() })),
    });
    receipts++;

    // Ajuste grande pendiente de aprobación (supera el umbral de 100).
    const cemento = products.find((p) => p.item.name.startsWith("Cemento"));
    if (cemento) {
      await requestAdjustment(owner, { warehouseId: deposito, productId: cemento.id, direction: "OUT", kind: "ADJUSTMENT", quantity: "15", unit: "UND", reason: "Sacos rotos encontrados en el depósito" }).catch(() => undefined);
    }
    // Conteo aplicado (ferretería) y otro enviado pendiente de aprobación.
    // Productos de mayor costo: las diferencias superan el umbral y requieren aprobación de otro usuario.
    const fer = products.filter((p) => p.warehouse === "deposito").sort((a, b) => b.item.cost - a.item.cost).slice(0, 8).map((p) => p.id);
    for (const [i, approve] of [true, false].entries()) {
      const c = await createStockCount(owner, { warehouseId: deposito, note: approve ? "Conteo cíclico de ferretería" : "Conteo de cierre de mes", productIds: fer.slice(i * 4, i * 4 + 4) });
      const detail = await getStockCount(owner, c.id);
      await recordCountQuantities(owner, c.id, detail.lines.map((l, j) => ({ lineId: l.id, counted: Math.max(0, Number(l.expected) + (j % 2 === 0 ? -12 : 2)) })));
      await submitStockCount(owner, c.id);
      const status = await withContext({ tenantId }, (tx) => tx.stockCount.findUniqueOrThrow({ where: { id: c.id }, select: { status: true } }));
      if (approve && status.status === "PENDING_APPROVAL") await approveStockCount(manager, c.id);
    }
    // Transferencia en tránsito (enviada hoy, sin recibir).
    const transit = products.filter((p) => p.warehouse === "principal" && p.shelfLife === null).slice(5, 8);
    if (transit.length) {
      const t = await createTransfer(owner, { fromWarehouseId: principal, toWarehouseId: almCentro, note: "En camino a la sucursal", lines: transit.map((p) => ({ productId: p.id, quantity: "2", unit: p.item.unit })) });
      await sendTransfer(owner, t.id).catch(() => undefined);
    }
    // Productos con stock bajo: mínimo por encima de la existencia actual (alertas y reposición sugerida).
    const lowCandidates = products.filter((p) => p.index % 11 === 0);
    for (const p of lowCandidates) {
      const agg = await withContext({ tenantId }, (tx) => tx.stockBalance.aggregate({ where: { tenantId, productId: p.id }, _sum: { onHand: true } }));
      const onHand = Number(agg._sum.onHand ?? 0);
      await updateProductInventorySettings(owner, p.id, { minStock: String(Math.ceil(onHand + p.item.demand * 5)) });
    }
    // Un lote en cuarentena.
    const quarantine = await withContext({ tenantId }, (tx) => tx.lot.findFirst({ where: { tenantId, status: "AVAILABLE", expiresAt: { gt: realNow } }, orderBy: { receivedAt: "desc" } }));
    if (quarantine) await setLotStatus(owner, quarantine.id, "QUARANTINE", "Revisión de calidad por cadena de frío");

    await runTenantAlerts(tenantId);
    await withContext({ tenantId, userId: user.userId }, async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: { name: DEMO_COMPANY_NAME } });
      await recordAudit(tx, {
        tenantId,
        actorUserId: user.userId,
        action: "demo.generated",
        entityType: "Tenant",
        entityId: tenantId,
        metadata: { products: products.length, receipts, sales, days },
        meta: user.meta,
      });
    });
    log("Listo.");
    return { tenantId, products: products.length, receipts, sales, managerEmail };
  }
}
