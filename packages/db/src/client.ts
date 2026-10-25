import { PrismaClient } from "@prisma/client";

/**
 * Cliente Prisma único por proceso. Se conecta con DATABASE_URL (rol rc_app,
 * sujeto a RLS). Nunca usar credenciales del dueño del esquema en runtime.
 */
const globalForPrisma = globalThis as unknown as { __rcPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__rcPrisma ??
  new PrismaClient({
    log:
      process.env.PRISMA_LOG_QUERIES === "1"
        ? ["query", "warn", "error"]
        : process.env.PRISMA_QUIET === "1"
          ? []
          : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__rcPrisma = prisma;
}

export type DbClient = PrismaClient;
