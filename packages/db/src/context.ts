import type { Prisma } from "@prisma/client";
import { prisma } from "./client";

export type Tx = Prisma.TransactionClient;

/**
 * Contexto de seguridad que se fija en PostgreSQL para una transacción.
 * Las políticas RLS leen estos valores con current_setting('app.*').
 *
 * - tenantId: empresa autorizada (ya validada contra Membership por el servidor).
 * - userId / userEmail: usuario autenticado (permite leer sus propias membresías
 *   e invitaciones dirigidas a su correo).
 * - platformAdmin: solo superadministradores con MFA; da acceso a metadatos de
 *   plataforma (empresas, planes, suscripciones), NUNCA a inventarios.
 */
export interface DbContext {
  tenantId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  platformAdmin?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuidOrEmpty(value: string | null | undefined, field: string): string {
  if (value == null || value === "") return "";
  if (!UUID_RE.test(value)) {
    throw new Error(`Contexto de base de datos inválido: ${field}`);
  }
  return value.toLowerCase();
}

export interface WithContextOptions {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  timeoutMs?: number;
  client?: { $transaction: typeof prisma.$transaction };
}

/**
 * Ejecuta `fn` dentro de una transacción con el contexto fijado mediante
 * set_config(..., is_local = true). Al terminar la transacción PostgreSQL
 * descarta los valores, de modo que no se filtran a otra petición que reutilice
 * la misma conexión del pool.
 */
export async function withContext<T>(
  ctx: DbContext,
  fn: (tx: Tx) => Promise<T>,
  options: WithContextOptions = {},
): Promise<T> {
  const tenantId = assertUuidOrEmpty(ctx.tenantId, "tenantId");
  const userId = assertUuidOrEmpty(ctx.userId, "userId");
  const userEmail = (ctx.userEmail ?? "").trim().toLowerCase();
  const platform = ctx.platformAdmin ? "on" : "off";
  const client = options.client ?? prisma;

  return client.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT
        set_config('app.tenant_id', ${tenantId}, true),
        set_config('app.user_id', ${userId}, true),
        set_config('app.user_email', ${userEmail}, true),
        set_config('app.platform_admin', ${platform}, true)`;
      return fn(tx);
    },
    {
      isolationLevel: options.isolationLevel,
      timeout: options.timeoutMs ?? 15_000,
      maxWait: 10_000,
    },
  );
}

/** Atajo: transacción dentro de una empresa ya autorizada. */
export function withTenant<T>(
  tenantId: string,
  userId: string | null,
  fn: (tx: Tx) => Promise<T>,
  options?: WithContextOptions,
): Promise<T> {
  return withContext({ tenantId, userId }, fn, options);
}
