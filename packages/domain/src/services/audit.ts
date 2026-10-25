import { Prisma, type Tx } from "@rc/db";
import type { RequestMeta } from "./types";

const SENSITIVE_KEY = /(secret|token|password|passwd|pepper|code_?hash|recovery|otp|cookie|authorization)/i;

/** Elimina recursivamente claves sensibles antes de guardar en la bitácora. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toString();
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[REDACTADO]" : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "bigint") return value.toString();
  return value;
}

export interface AuditInput {
  tenantId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  meta?: RequestMeta;
}

function toJson(v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (v === undefined || v === null) return Prisma.DbNull;
  return redact(v) as Prisma.InputJsonValue;
}

/**
 * Registra un evento dentro de la MISMA transacción que el cambio auditado:
 * si el cambio se revierte, el evento también; si el evento falla, el cambio
 * no se confirma.
 */
export async function recordAudit(tx: Tx, input: AuditInput): Promise<void> {
  await tx.auditEvent.create({
    data: {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: toJson(input.before),
      after: toJson(input.after),
      metadata: toJson(input.metadata),
      ipAddress: input.meta?.ipAddress ?? null,
      userAgent: input.meta?.userAgent?.slice(0, 300) ?? null,
      correlationId: input.meta?.correlationId ?? null,
    },
  });
}
