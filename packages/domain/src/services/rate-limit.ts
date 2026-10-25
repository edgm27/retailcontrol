import { prisma } from "@rc/db";
import { rateLimited } from "../errors";

/**
 * Ventana fija atómica en PostgreSQL (una sentencia INSERT … ON CONFLICT).
 * Suficiente para Fase 1; puede migrarse a Redis sin cambiar la interfaz.
 * Devuelve el conteo actual dentro de la ventana.
 */
export async function hitRateLimit(key: string, windowSeconds: number): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit_buckets (key, window_start, count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit_buckets.window_start < now() - make_interval(secs => ${windowSeconds}::double precision)
                   THEN 1 ELSE rate_limit_buckets.count + 1 END,
      window_start = CASE WHEN rate_limit_buckets.window_start < now() - make_interval(secs => ${windowSeconds}::double precision)
                   THEN now() ELSE rate_limit_buckets.window_start END
    RETURNING count`;
  return Number(rows[0]?.count ?? 0);
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const count = await hitRateLimit(key, windowSeconds);
  if (count > limit) throw rateLimited();
}
