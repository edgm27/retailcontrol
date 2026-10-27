/* eslint-disable no-console -- script de línea de comandos: imprime resultados */
/**
 * Prueba de rendimiento (Fase 5). Crea una empresa sintética con datos FICTICIOS a escala
 * (por defecto 50 000 productos, 2 almacenes, ~300 000 movimientos en 180 días) y mide
 * p50/p95 de las consultas de las pantallas principales con el rol de la app (rc_app, con RLS).
 *
 * Uso (base local o de staging, NUNCA producción):
 *   pnpm perf:load            # PERF_PRODUCTS=50000 PERF_MOVEMENTS=300000 PERF_RUNS=30
 */
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { prisma, withContext } from "@rc/db";
import {
  createTenantWithOwner,
  getDashboardAnalytics,
  listKardex,
  listProducts,
  listStock,
  resolveTenantAccess,
  runReport,
  type TenantActor,
} from "@rc/domain";

const PRODUCTS = Number(process.env.PERF_PRODUCTS ?? 50_000);
const MOVEMENTS = Number(process.env.PERF_MOVEMENTS ?? 300_000);
const RUNS = Number(process.env.PERF_RUNS ?? 30);

async function seed(): Promise<{ actor: TenantActor; sampleProductId: string }> {
  const email = `perf.${randomUUID().slice(0, 8)}@example.com`;
  const u = await prisma.user.create({ data: { email, name: "Perf", emailVerified: new Date() } });
  const c = await createTenantWithOwner({ userId: u.id, email }, { name: "Empresa de carga (ficticia)" }, { planCode: "EMPRESARIAL" });
  const acc = (await resolveTenantAccess(u.id, c.tenant.id))!;
  const actor: TenantActor = { userId: u.id, email, tenantId: c.tenant.id, membershipId: acc.membershipId, role: acc.role, branchIds: acc.branchIds };
  const T = c.tenant.id;
  const t0 = performance.now();
  await withContext({ tenantId: T, userId: u.id }, async (tx) => {
    const w2 = randomUUID();
    await tx.$executeRaw`INSERT INTO warehouses (id, tenant_id, branch_id, code, name, active, created_at, updated_at)
      VALUES (${w2}::uuid, ${T}::uuid, ${c.branchId}::uuid, 'ALM-02', 'Depósito', true, now(), now())`;
    await tx.$executeRaw`
      INSERT INTO products (id, tenant_id, sku, name, base_unit, lot_tracking, requires_expiry, min_stock, avg_cost, status, created_at, updated_at)
      SELECT gen_random_uuid(), ${T}::uuid, 'SKU-' || lpad(i::text, 6, '0'), 'Producto de prueba ' || i, 'UND', false, false,
             (i % 50)::numeric, round((0.5 + random() * 20)::numeric, 6), 'ACTIVE', now(), now()
      FROM generate_series(1, ${PRODUCTS}::int) i`;
    // Movimientos: 40 % entradas, 55 % salidas, 5 % mermas; distribución tipo Pareto (pocos productos concentran salidas).
    await tx.$executeRaw`
      WITH p AS (SELECT id, avg_cost, row_number() OVER (ORDER BY sku) AS rn FROM products WHERE tenant_id = ${T}::uuid),
      w AS (SELECT array_agg(id) AS ids FROM warehouses WHERE tenant_id = ${T}::uuid),
      g AS (
        SELECT i, (1 + floor(${PRODUCTS}::int * power(random(), 3)))::int AS rn, random() AS r, (random() * 180)::int AS d FROM generate_series(1, ${MOVEMENTS}::int) i
      )
      INSERT INTO stock_movements (id, tenant_id, operation_id, type, warehouse_id, product_id, quantity, entered_quantity, entered_unit, unit_cost, currency, reason, actor_user_id, created_at)
      SELECT gen_random_uuid(), ${T}::uuid, gen_random_uuid(),
             (CASE WHEN g.r < 0.40 THEN 'RECEIPT' WHEN g.r < 0.95 THEN 'ISSUE' ELSE 'WASTE' END)::"MovementType",
             w.ids[1 + (g.i % 2)], p.id,
             CASE WHEN g.r < 0.40 THEN 10 + (g.i % 40) ELSE -(1 + (g.i % 6)) END,
             CASE WHEN g.r < 0.40 THEN 10 + (g.i % 40) ELSE 1 + (g.i % 6) END,
             'UND', p.avg_cost, 'USD', CASE WHEN g.r >= 0.95 THEN 'Producto dañado' END, ${u.id}::uuid,
             now() - make_interval(days => g.d, mins => (g.i % 600))
      FROM g JOIN p ON p.rn = g.rn CROSS JOIN w`;
    await tx.$executeRaw`
      INSERT INTO stock_balances (id, tenant_id, warehouse_id, product_id, lot_id, lot_key, on_hand, reserved, updated_at)
      SELECT gen_random_uuid(), ${T}::uuid, warehouse_id, product_id, NULL, '00000000-0000-0000-0000-000000000000'::uuid, GREATEST(SUM(quantity), 0) + 5, 0, now()
      FROM stock_movements WHERE tenant_id = ${T}::uuid GROUP BY warehouse_id, product_id`;
  }, { timeoutMs: 600_000 });
  await analyze();
  console.log(`Datos generados en ${((performance.now() - t0) / 1000).toFixed(1)} s (${PRODUCTS} productos, ${MOVEMENTS} movimientos).`);
  const sample = await withContext({ tenantId: T }, (tx) =>
    tx.$queryRaw<{ product_id: string }[]>`SELECT product_id FROM stock_movements WHERE tenant_id = ${T}::uuid GROUP BY product_id ORDER BY count(*) DESC LIMIT 1`,
  );
  return { actor, sampleProductId: sample[0]!.product_id };
}

/** Estadísticas del planificador tras la carga masiva (rc_app no es dueño de las tablas: se usa el rol dueño). */
async function analyze() {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) return console.warn("Sin MIGRATION_DATABASE_URL: no se ejecuta ANALYZE (los tiempos pueden ser peores).");
  const { PrismaClient } = await import("@prisma/client");
  const owner = new PrismaClient({ datasourceUrl: url });
  try {
    await owner.$executeRaw`ANALYZE products`;
    await owner.$executeRaw`ANALYZE stock_movements`;
    await owner.$executeRaw`ANALYZE stock_balances`;
    await owner.$executeRaw`ANALYZE lots`;
    await owner.$executeRaw`ANALYZE warehouses`;
  } finally {
    await owner.$disconnect();
  }
}

/** Reutiliza una empresa ya generada (PERF_TENANT_ID) para repetir mediciones sin volver a cargar datos. */
async function reuse(tenantId: string): Promise<{ actor: TenantActor; sampleProductId: string }> {
  const m = await withContext({ tenantId }, (tx) => tx.membership.findFirstOrThrow({ where: { tenantId, role: "OWNER" }, include: { user: true } }));
  const acc = (await resolveTenantAccess(m.userId, tenantId))!;
  const sample = await withContext({ tenantId }, (tx) =>
    tx.$queryRaw<{ product_id: string }[]>`SELECT product_id FROM stock_movements WHERE tenant_id = ${tenantId}::uuid GROUP BY product_id ORDER BY count(*) DESC LIMIT 1`,
  );
  await analyze();
  return {
    actor: { userId: m.userId, email: m.user.email, tenantId, membershipId: acc.membershipId, role: acc.role, branchIds: acc.branchIds },
    sampleProductId: sample[0]!.product_id,
  };
}

function pct(values: number[], p: number) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
}

async function measure(name: string, fn: () => Promise<unknown>) {
  await fn(); // calentamiento
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    await fn();
    times.push(performance.now() - t);
  }
  return { name, p50: pct(times, 50), p95: pct(times, 95), max: Math.max(...times) };
}

async function main() {
  const { actor, sampleProductId } = process.env.PERF_TENANT_ID ? await reuse(process.env.PERF_TENANT_ID) : await seed();
  const results = [];
  results.push(await measure("Productos: página 1", () => listProducts(actor, { page: 1 })));
  results.push(await measure("Productos: búsqueda", () => listProducts(actor, { search: "prueba 4321" })));
  results.push(await measure("Inventario: existencias pág. 1", () => listStock(actor, {})));
  results.push(await measure("Inicio: tablero 30 días", () => getDashboardAnalytics(actor, { days: 30 })));
  results.push(await measure("Inicio: tablero 90 días", () => getDashboardAnalytics(actor, { days: 90 })));
  results.push(await measure("Kardex de un producto", () => listKardex(actor, { productId: sampleProductId })));
  results.push(await measure("Reporte ABC 90 días (pantalla)", () => runReport(actor, "abc", { days: 90, limit: 500 })));
  results.push(await measure("Reporte rotación 90 días", () => runReport(actor, "rotacion", { days: 90, limit: 500 })));
  results.push(await measure("Reporte existencias", () => runReport(actor, "existencias", { limit: 500 })));
  results.push(await measure("Movimientos 30 días (500)", () => runReport(actor, "movimientos", { days: 30, limit: 500 })));
  console.log("\n| Consulta | p50 (ms) | p95 (ms) | máx (ms) |\n|---|---:|---:|---:|");
  for (const r of results) console.log(`| ${r.name} | ${r.p50.toFixed(0)} | ${r.p95.toFixed(0)} | ${r.max.toFixed(0)} |`);
  console.log(`\nEmpresa de prueba: ${actor.tenantId} (se puede dejar en la base local o borrar la base de pruebas).`);
}

main().finally(() => prisma.$disconnect());
