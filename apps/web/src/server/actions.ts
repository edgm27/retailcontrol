import "server-only";
import { isDomainError } from "@rc/domain";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { logger } from "./logger";

export interface FormState<T = unknown> {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  data?: T;
}

export const initialFormState: FormState = { ok: false };

/**
 * Ejecuta la lógica de una acción y traduce errores a mensajes para el usuario
 * sin exponer detalles internos (los errores inesperados solo van al log).
 */
export async function runAction<T>(fn: () => Promise<FormState<T>>): Promise<FormState<T>> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e);
    if (isDomainError(e)) return { ok: false, error: e.message };
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) {
        const k = issue.path.map(String).join(".") || "_";
        fieldErrors[k] ??= issue.message;
      }
      return { ok: false, error: "Revise los datos del formulario.", fieldErrors };
    }
    logger.error({ err: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : e }, "error inesperado en acción");
    return { ok: false, error: "Ocurrió un error inesperado. Intente de nuevo." };
  }
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}
