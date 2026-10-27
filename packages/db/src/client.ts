import { PrismaClient } from "@prisma/client";

/**
 * Cliente Prisma único por proceso. Se conecta con DATABASE_URL (rol rc_app,
 * sujeto a RLS). Nunca usar credenciales del dueño del esquema en runtime.
 */
const globalForPrisma = globalThis as unknown as { __rcPrisma?: PrismaClient };

const slowMs = Number(process.env.SLOW_QUERY_MS ?? 0);

function create(): PrismaClient {
  const client = new PrismaClient({
    log: [
      ...(process.env.PRISMA_LOG_QUERIES === "1" || slowMs > 0 ? [{ emit: "event" as const, level: "query" as const }] : []),
      ...(process.env.PRISMA_QUIET === "1" ? [] : (["warn", "error"] as const)),
    ],
  });
  if (process.env.PRISMA_LOG_QUERIES === "1" || slowMs > 0) {
    // Consultas lentas (SLOW_QUERY_MS): se registra la plantilla SQL y la duración, NUNCA los parámetros.
    (client as unknown as { $on: (e: "query", cb: (q: { query: string; duration: number }) => void) => void }).$on("query", (q) => {
      if (process.env.PRISMA_LOG_QUERIES === "1" || q.duration >= slowMs) {
        console.warn(JSON.stringify({ level: "warn", event: "slow_query", durationMs: q.duration, query: q.query.slice(0, 500) }));
      }
    });
  }
  return client;
}

export const prisma: PrismaClient = globalForPrisma.__rcPrisma ?? create();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__rcPrisma = prisma;
}

export type DbClient = PrismaClient;
