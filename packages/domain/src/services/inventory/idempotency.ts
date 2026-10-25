import { Prisma, type Tx } from "@rc/db";
import { conflict, validation } from "../../errors";
import { sha256Hex } from "../../security/crypto";

/**
 * Idempotencia de mutaciones de inventario.
 * La clave se inserta DENTRO de la misma transacción que la operación:
 * - Si la operación falla, la clave también se revierte (se puede reintentar).
 * - Dos peticiones simultáneas con la misma clave: la segunda espera al índice
 *   único, ve la clave ya confirmada y devuelve el MISMO resultado sin repetir.
 * - Misma clave con datos distintos: conflicto (protege contra errores del cliente).
 */
export async function claimIdempotencyKey<T>(
  tx: Tx,
  args: { tenantId: string; key: string; operation: string; payload: unknown },
): Promise<{ replay: T } | { claimed: true; hash: string }> {
  const key = args.key.trim();
  if (!/^[A-Za-z0-9_.:-]{8,100}$/.test(key)) throw validation("Clave de idempotencia inválida.");
  const hash = sha256Hex(JSON.stringify(args.payload));
  const inserted = await tx.$queryRaw<{ key: string }[]>`
    INSERT INTO idempotency_keys (tenant_id, key, operation, request_hash, created_at)
    VALUES (${args.tenantId}::uuid, ${key}, ${args.operation}, ${hash}, now())
    ON CONFLICT (tenant_id, key) DO NOTHING
    RETURNING key`;
  if (inserted.length) return { claimed: true, hash };
  const existing = await tx.idempotencyKey.findUnique({ where: { tenantId_key: { tenantId: args.tenantId, key } } });
  if (!existing || existing.operation !== args.operation || existing.requestHash !== hash) {
    throw conflict("Esta operación ya se registró con otros datos (clave de idempotencia repetida).");
  }
  return { replay: existing.result as T };
}

export async function storeIdempotencyResult(tx: Tx, tenantId: string, key: string, result: unknown) {
  await tx.idempotencyKey.update({
    where: { tenantId_key: { tenantId, key: key.trim() } },
    data: { result: result as Prisma.InputJsonValue },
  });
}
