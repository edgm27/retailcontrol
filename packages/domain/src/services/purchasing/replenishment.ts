import { Prisma, withTenant } from "@rc/db";
import { assertPermission } from "../../rbac";
import { UNITS } from "../../units";
import type { TenantActor } from "../types";


type Decimal = Prisma.Decimal;

/**
 * Sugerencia de reposición (NO crea compras sola: solo propone).
 * Para productos con stock mínimo:
 *   demanda diaria = salidas de los últimos 30 días / 30
 *   objetivo = max(2 × mínimo, demanda diaria × días de cobertura)
 *   sugerido = objetivo − disponible − pendiente en órdenes abiertas (si > 0)
 */
export async function listReplenishmentSuggestions(actor: TenantActor, opts: { coverageDays?: number } = {}) {
  assertPermission(actor, "purchases.read");
  const coverage = Math.min(Math.max(opts.coverageDays ?? 15, 1), 120);
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const rows = await tx.$queryRaw<
      {
        product_id: string; sku: string; name: string; base_unit: string; min_stock: Decimal; avg_cost: Decimal;
        available: Decimal; issued_30: Decimal; on_order: Decimal; supplier_id: string | null; supplier_name: string | null;
        last_price: Decimal | null; last_currency: string | null;
      }[]
    >`
      SELECT p.id AS product_id, p.sku, p.name, p.base_unit, p.min_stock, p.avg_cost,
        COALESCE((SELECT SUM(b.on_hand - b.reserved) FROM stock_balances b WHERE b.tenant_id = p.tenant_id AND b.product_id = p.id), 0) AS available,
        COALESCE((SELECT -SUM(m.quantity) FROM stock_movements m WHERE m.tenant_id = p.tenant_id AND m.product_id = p.id
                    AND m.type IN ('ISSUE', 'WASTE', 'RETURN_OUT') AND m.created_at >= now() - interval '30 days'), 0) AS issued_30,
        COALESCE((SELECT SUM(l.quantity - l.received_quantity) FROM purchase_order_lines l JOIN purchase_orders o ON o.id = l.purchase_order_id
                    WHERE l.tenant_id = p.tenant_id AND l.product_id = p.id AND o.status IN ('DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED')), 0) AS on_order,
        p.preferred_supplier_id AS supplier_id, s.name AS supplier_name,
        lp.unit_price AS last_price, lp.currency AS last_currency
      FROM products p
      LEFT JOIN suppliers s ON s.id = p.preferred_supplier_id
      LEFT JOIN LATERAL (
        SELECT gl.unit_price / NULLIF(gl.quantity / gl.entered_quantity, 0) AS unit_price, g.currency::text AS currency
        FROM goods_receipt_lines gl JOIN goods_receipts g ON g.id = gl.receipt_id
        WHERE gl.tenant_id = p.tenant_id AND gl.product_id = p.id
        ORDER BY g.received_at DESC LIMIT 1
      ) lp ON true
      WHERE p.tenant_id = ${actor.tenantId}::uuid AND p.status = 'ACTIVE' AND p.min_stock IS NOT NULL
      ORDER BY p.sku`;
    const out = [];
    for (const r of rows) {
      const daily = r.issued_30.dividedBy(30);
      const target = Prisma.Decimal.max(r.min_stock.times(2), daily.times(coverage));
      let suggested = target.minus(r.available).minus(r.on_order);
      if (suggested.lessThanOrEqualTo(0)) continue;
      const decimals = UNITS[r.base_unit]?.decimals ?? 0;
      suggested = suggested.toDecimalPlaces(decimals, Prisma.Decimal.ROUND_UP);
      out.push({
        productId: r.product_id,
        sku: r.sku,
        name: r.name,
        baseUnit: r.base_unit,
        available: r.available.toString(),
        minStock: r.min_stock.toString(),
        dailyDemand: daily.toDecimalPlaces(3).toString(),
        onOrder: r.on_order.toString(),
        suggested: suggested.toString(),
        supplierId: r.supplier_id,
        supplierName: r.supplier_name,
        lastPrice: r.last_price ? r.last_price.toDecimalPlaces(6).toString() : null,
        lastCurrency: r.last_currency,
        estimatedCost: suggested.times(r.avg_cost).toDecimalPlaces(2).toString(),
      });
    }
    return { coverageDays: coverage, items: out };
  });
}

