import { Prisma, withTenant } from "@rc/db";
import { assertPermission } from "../../rbac";
import { getInventoryPolicy, todayIn } from "../inventory/core";
import { currentRate } from "./rates";
import type { TenantActor } from "../types";

/*
 * Apoyo a la recepción con escáner (celular): identificar el producto por su código de barras
 * (o SKU) y devolver lo necesario para capturar la línea sin volver a consultar: unidades y
 * presentaciones, unidad que representa el código, último costo y lotes con existencia.
 */

export interface ScanProduct {
  productId: string;
  sku: string;
  name: string;
  baseUnit: string;
  lotTracking: boolean;
  requiresExpiry: boolean;
  /** Unidad que representa el código escaneado (presentación o base). */
  scannedUnit: string;
  units: { code: string; name: string; factor: string }[];
  /** Último costo de entrada por unidad base, en moneda base (o costo promedio si no hay entradas). */
  lastCost: string | null;
  avgCost: string;
  lots: { lotNumber: string; expiresAt: string | null; onHand: string }[];
}

const SELECT = {
  id: true, sku: true, name: true, baseUnit: true, lotTracking: true, requiresExpiry: true, avgCost: true, status: true,
  units: { select: { code: true, name: true, factorToBase: true }, orderBy: { code: "asc" as const } },
} as const;

type Row = Prisma.ProductGetPayload<{ select: typeof SELECT }>;

async function enrich(tx: Prisma.TransactionClient, tenantId: string, p: Row, scannedUnit: string | null): Promise<ScanProduct> {
  const [last] = await tx.$queryRaw<{ unit_cost: Prisma.Decimal | null }[]>`
    SELECT unit_cost FROM stock_movements
    WHERE tenant_id = ${tenantId}::uuid AND product_id = ${p.id}::uuid AND type IN ('RECEIPT', 'RETURN_IN') AND unit_cost IS NOT NULL
    ORDER BY created_at DESC LIMIT 1`;
  const lots = await tx.$queryRaw<{ lot_number: string; expires_at: Date | null; on_hand: Prisma.Decimal }[]>`
    SELECT l.lot_number, l.expires_at, COALESCE(SUM(b.on_hand), 0) AS on_hand
    FROM lots l LEFT JOIN stock_balances b ON b.lot_id = l.id AND b.tenant_id = l.tenant_id
    WHERE l.tenant_id = ${tenantId}::uuid AND l.product_id = ${p.id}::uuid AND l.status = 'AVAILABLE'
    GROUP BY l.id, l.lot_number, l.expires_at, l.received_at
    ORDER BY l.received_at DESC LIMIT 8`;
  return {
    productId: p.id,
    sku: p.sku,
    name: p.name,
    baseUnit: p.baseUnit,
    lotTracking: p.lotTracking,
    requiresExpiry: p.requiresExpiry,
    scannedUnit: scannedUnit ?? p.baseUnit,
    units: p.units.map((u) => ({ code: u.code, name: u.name, factor: u.factorToBase.toString() })),
    lastCost: last?.unit_cost?.toString() ?? null,
    avgCost: p.avgCost.toString(),
    lots: lots.map((l) => ({ lotNumber: l.lot_number, expiresAt: l.expires_at?.toISOString().slice(0, 10) ?? null, onHand: l.on_hand.toString() })),
  };
}

/** Busca por código de barras (exacto) o SKU. Devuelve null si no existe o el producto está inactivo. */
export async function lookupProductForReceipt(actor: TenantActor, rawCode: string): Promise<ScanProduct | null> {
  assertPermission(actor, "purchases.receive");
  const code = rawCode.trim().replace(/\s+/g, "");
  if (!code || code.length > 64) return null;
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const bc = await tx.productBarcode.findUnique({ where: { tenantId_code: { tenantId: actor.tenantId, code } }, select: { unitCode: true, product: { select: SELECT } } });
    if (bc && bc.product.status === "ACTIVE") return enrich(tx, actor.tenantId, bc.product, bc.unitCode);
    const bySku = await tx.product.findUnique({ where: { tenantId_sku: { tenantId: actor.tenantId, sku: code.toUpperCase() } }, select: SELECT });
    if (bySku && bySku.status === "ACTIVE") return enrich(tx, actor.tenantId, bySku, null);
    return null;
  });
}

/** Para un código no registrado: buscar el producto por nombre o SKU (máx. 10). */
export async function searchProductsForReceipt(actor: TenantActor, q: string) {
  assertPermission(actor, "purchases.receive");
  const term = q.trim();
  if (term.length < 2) return [];
  return withTenant(actor.tenantId, actor.userId, (tx) =>
    tx.product.findMany({
      where: { tenantId: actor.tenantId, status: "ACTIVE", OR: [{ sku: { contains: term, mode: "insensitive" } }, { name: { contains: term, mode: "insensitive" } }] },
      select: { id: true, sku: true, name: true },
      orderBy: { name: "asc" },
      take: 10,
    }),
  );
}

export async function getProductForReceipt(actor: TenantActor, productId: string): Promise<ScanProduct | null> {
  assertPermission(actor, "purchases.receive");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const p = await tx.product.findFirst({ where: { id: productId, tenantId: actor.tenantId, status: "ACTIVE" }, select: SELECT });
    return p ? enrich(tx, actor.tenantId, p, null) : null;
  });
}

/** Datos de contexto para la pantalla: moneda base y tasa del día (para sugerir costos en Bs.). */
export async function getReceiptScanContext(actor: TenantActor) {
  assertPermission(actor, "purchases.receive");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const policy = await getInventoryPolicy(tx, actor.tenantId);
    const r = await currentRate(tx, actor.tenantId, todayIn(policy.timezone));
    return { baseCurrency: policy.baseCurrency, rate: r?.rate.toString() ?? null, rateDate: r?.effectiveDate.toISOString().slice(0, 10) ?? null };
  });
}
