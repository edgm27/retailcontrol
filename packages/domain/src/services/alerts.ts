import { Prisma, prisma, withContext, withTenant } from "@rc/db";
import { assertPermission } from "../rbac";
import { getInventoryPolicy, todayIn } from "./inventory/core";
import { forEachActiveTenant } from "./jobs";
import { hitRateLimit } from "./rate-limit";
import type { TenantActor } from "./types";

type Decimal = Prisma.Decimal;
const RECIPIENT_ROLES = ["OWNER", "ADMIN", "MANAGER", "WAREHOUSE", "BUYER"] as const;

export interface AlertRunResult {
  created: number;
  candidates: number;
}

/**
 * Genera alertas de una empresa (idempotente: puede ejecutarse N veces).
 * - Vencimiento: por lote con existencia, al cruzar cada umbral configurado
 *   (p. ej. 30, 15, 7 días) y al vencer. Clave de deduplicación por lote+umbral.
 * - Stock bajo: una por producto y día.
 * Destinatarios: miembros activos con roles operativos.
 */
export async function runTenantAlerts(tenantId: string, now = new Date()): Promise<AlertRunResult> {
  return withContext({ tenantId }, async (tx) => {
    const settings = await tx.tenantSettings.findUnique({ where: { tenantId } });
    const policy = await getInventoryPolicy(tx, tenantId);
    const today = todayIn(policy.timezone, now);
    const thresholds = [...(settings?.expiryAlertDays ?? [7, 15, 30, 60, 90])].sort((a, b) => a - b);
    const members = await tx.membership.findMany({
      where: { tenantId, status: "ACTIVE", role: { in: [...RECIPIENT_ROLES] } },
      select: { userId: true },
    });
    if (!members.length) return { created: 0, candidates: 0 };

    const candidates: { kind: string; dedupeKey: string; title: string; body: string; link: string }[] = [];
    if (thresholds.length) {
      const maxDays = thresholds[thresholds.length - 1]!;
      const lots = await tx.$queryRaw<{ lot_id: string; lot_number: string; sku: string; name: string; days_left: number; on_hand: Decimal; base_unit: string }[]>`
        SELECT l.id AS lot_id, l.lot_number, p.sku, p.name, (l.expires_at - ${today}::date)::int AS days_left,
               SUM(b.on_hand) AS on_hand, p.base_unit
        FROM lots l JOIN stock_balances b ON b.lot_id = l.id JOIN products p ON p.id = l.product_id
        WHERE l.tenant_id = ${tenantId}::uuid AND l.expires_at IS NOT NULL AND l.expires_at <= ${today}::date + ${maxDays}::int
        GROUP BY l.id, l.lot_number, p.sku, p.name, l.expires_at, p.base_unit
        HAVING SUM(b.on_hand) > 0`;
      for (const l of lots) {
        // Umbral más estricto alcanzado (o "vencido").
        const stage = l.days_left < 0 ? "vencido" : String(thresholds.find((t) => l.days_left <= t));
        const qty = `${l.on_hand.toString()} ${l.base_unit}`;
        candidates.push({
          kind: "expiry",
          dedupeKey: `expiry:${l.lot_id}:${stage}`,
          title: l.days_left < 0 ? `Lote vencido: ${l.sku}` : `${l.sku} vence en ${l.days_left} día(s)`,
          body: `${l.name} · lote ${l.lot_number} · ${qty} en existencia.`,
          link: "/app/lotes?dias=90",
        });
      }
    }
    const low = await tx.$queryRaw<{ product_id: string; sku: string; name: string; available: Decimal; min_stock: Decimal; base_unit: string }[]>`
      SELECT p.id AS product_id, p.sku, p.name, COALESCE(SUM(b.on_hand - b.reserved), 0) AS available, p.min_stock, p.base_unit
      FROM products p LEFT JOIN stock_balances b ON b.product_id = p.id
      WHERE p.tenant_id = ${tenantId}::uuid AND p.status = 'ACTIVE' AND p.min_stock IS NOT NULL
      GROUP BY p.id HAVING COALESCE(SUM(b.on_hand - b.reserved), 0) < p.min_stock`;
    for (const p of low) {
      candidates.push({
        kind: "low_stock",
        dedupeKey: `low:${p.product_id}:${today}`,
        title: `Stock bajo: ${p.sku}`,
        body: `${p.name}: disponible ${p.available.toString()} ${p.base_unit}, mínimo ${p.min_stock.toString()}.`,
        link: "/app/reposicion",
      });
    }
    let created = 0;
    for (const c of candidates) {
      for (const m of members) {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO notifications (id, tenant_id, user_id, kind, title, body, link, dedupe_key, created_at)
          VALUES (gen_random_uuid(), ${tenantId}::uuid, ${m.userId}::uuid, ${c.kind}, ${c.title}, ${c.body}, ${c.link}, ${c.dedupeKey}, now())
          ON CONFLICT (tenant_id, user_id, dedupe_key) DO NOTHING
          RETURNING id`;
        created += rows.length;
      }
    }
    return { created, candidates: candidates.length };
  });
}

/** Job de plataforma: todas las empresas, cada una en su propia transacción (RLS). */
export async function runAllTenantAlerts(now = new Date()) {
  const results = await forEachActiveTenant(async (_tx, tenantId) => tenantId);
  let created = 0;
  for (const tenantId of results.keys()) created += (await runTenantAlerts(tenantId, now)).created;
  return { tenants: results.size, created };
}

/**
 * Sin worker (p. ej. plan gratuito de Render) las alertas se generan al abrir la
 * app, como máximo una vez por hora por empresa. Es idempotente.
 */
export async function maybeRunTenantAlerts(actor: TenantActor) {
  const count = await hitRateLimit(`alerts-run:${actor.tenantId}`, 3600);
  if (count === 1) await runTenantAlerts(actor.tenantId).catch(() => undefined);
}

export async function listNotifications(actor: TenantActor, opts: { unreadOnly?: boolean; take?: number } = {}) {
  assertPermission(actor, "inventory.read");
  return withTenant(actor.tenantId, actor.userId, (tx) =>
    tx.notification.findMany({
      where: { tenantId: actor.tenantId, userId: actor.userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts.take ?? 100, 300),
    }),
  );
}

export async function countUnreadNotifications(actor: TenantActor) {
  return withTenant(actor.tenantId, actor.userId, (tx) =>
    tx.notification.count({ where: { tenantId: actor.tenantId, userId: actor.userId, readAt: null } }),
  );
}

export async function markNotificationsRead(actor: TenantActor, ids?: string[]) {
  return withTenant(actor.tenantId, actor.userId, (tx) =>
    tx.notification.updateMany({
      where: { tenantId: actor.tenantId, userId: actor.userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    }),
  );
}

/** Correo resumen diario (opcional por empresa). Solo envía avisos no enviados; marca emailedAt. */
export async function collectPendingAlertEmails(tenantId: string) {
  return withContext({ tenantId }, async (tx) => {
    const s = await tx.tenantSettings.findUnique({ where: { tenantId } });
    if (!s?.alertEmailEnabled) return [];
    const pending = await tx.notification.findMany({ where: { tenantId, emailedAt: null }, orderBy: { createdAt: "asc" }, take: 500 });
    const byUser = new Map<string, typeof pending>();
    for (const n of pending) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);
    const users = await prisma.user.findMany({ where: { id: { in: [...byUser.keys()] } }, select: { id: true, email: true } });
    return users.map((u) => ({ email: u.email, userId: u.id, items: byUser.get(u.id)! }));
  });
}

export async function markAlertsEmailed(tenantId: string, ids: string[]) {
  if (!ids.length) return;
  await withContext({ tenantId }, (tx) => tx.notification.updateMany({ where: { id: { in: ids } }, data: { emailedAt: new Date() } }));
}
