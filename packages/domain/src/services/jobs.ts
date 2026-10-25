import { prisma, withContext, withTenant, type Tx } from "@rc/db";

/**
 * Patrón obligatorio para jobs por empresa: la lista de empresas se obtiene con
 * contexto de plataforma (solo ids), y cada unidad de trabajo corre en su
 * PROPIA transacción con app.tenant_id fijado. Un job nunca procesa dos
 * empresas en la misma transacción, así RLS impide mezclar datos.
 */
export async function forEachActiveTenant<T>(
  fn: (tx: Tx, tenantId: string) => Promise<T>,
): Promise<Map<string, T>> {
  const tenants = await withContext({ platformAdmin: true }, (tx) =>
    tx.tenant.findMany({ where: { status: "ACTIVE" }, select: { id: true }, orderBy: { createdAt: "asc" } }),
  );
  const results = new Map<string, T>();
  for (const t of tenants) {
    results.set(t.id, await withTenant(t.id, null, (tx) => fn(tx, t.id)));
  }
  return results;
}

/** Limpieza idempotente de datos efímeros globales (puede ejecutarse N veces). */
export async function purgeExpiredEphemeralData(now = new Date()) {
  const [sessions, tokens, buckets] = await Promise.all([
    prisma.session.deleteMany({ where: { expires: { lt: now } } }),
    prisma.verificationToken.deleteMany({ where: { expires: { lt: now } } }),
    prisma.rateLimitBucket.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 24 * 3_600_000) } } }),
  ]);
  return { sessions: sessions.count, verificationTokens: tokens.count, rateLimitBuckets: buckets.count };
}
