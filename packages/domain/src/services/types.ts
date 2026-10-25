import type { TenantAccess } from "../rbac";

export interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
}

/** Actor autorizado dentro de una empresa (membresía ya validada). */
export interface TenantActor extends TenantAccess {
  email: string;
  meta?: RequestMeta;
}

/** Usuario autenticado sin contexto de empresa. */
export interface UserActor {
  userId: string;
  email: string;
  meta?: RequestMeta;
}
