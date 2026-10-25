import "server-only";
import { findProductByCode, notFound, type TenantActor } from "@rc/domain";

/** Convierte lo escrito/escaneado (SKU o código de barras) en un producto de la empresa. */
export async function resolveProductCode(actor: TenantActor, code: string) {
  const c = code.split(" — ")[0]!.trim(); // admite "SKU — Nombre" del autocompletado
  if (!c) throw notFound("Indique el producto (SKU o código de barras).");
  const r = await findProductByCode(actor, c);
  if (!r) throw notFound(`No se encontró el producto "${c}".`);
  return r;
}
