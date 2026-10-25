/**
 * Errores de dominio con código estable. La capa web los traduce a mensajes
 * para el usuario sin exponer detalles internos.
 */
export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "LIMIT_EXCEEDED"
  | "READ_ONLY"
  | "RATE_LIMITED"
  | "MFA_REQUIRED"
  | "MFA_INVALID"
  | "MFA_LOCKED"
  | "INSUFFICIENT_STOCK";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: DomainErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

export const forbidden = (msg = "No tiene permiso para realizar esta acción.") =>
  new DomainError("FORBIDDEN", msg);
export const notFound = (msg = "Registro no encontrado.") => new DomainError("NOT_FOUND", msg);
export const conflict = (msg: string) => new DomainError("CONFLICT", msg);
export const validation = (msg: string, details?: Record<string, unknown>) =>
  new DomainError("VALIDATION", msg, details);
export const limitExceeded = (msg: string, details?: Record<string, unknown>) =>
  new DomainError("LIMIT_EXCEEDED", msg, details);
export const readOnly = (
  msg = "La suscripción de la empresa no permite cambios en este momento (modo solo lectura).",
) => new DomainError("READ_ONLY", msg);
export const rateLimited = (msg = "Demasiados intentos. Intente de nuevo más tarde.") =>
  new DomainError("RATE_LIMITED", msg);

export const insufficientStock = (msg = "Existencia insuficiente para esta operación.", details?: Record<string, unknown>) =>
  new DomainError("INSUFFICIENT_STOCK", msg, details);

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
