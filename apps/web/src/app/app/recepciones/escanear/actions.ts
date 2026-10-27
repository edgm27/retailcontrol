"use server";

import {
  addProductBarcode,
  getProductForReceipt,
  hasPermission,
  isDomainError,
  lookupProductForReceipt,
  receiveGoods,
  searchProductsForReceipt,
  type ScanProduct,
} from "@rc/domain";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { logger } from "@/server/logger";
import { requireTenant } from "@/server/session";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function safe<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (isDomainError(e)) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos." };
    // Las redirecciones de Next (sesión vencida) deben propagarse.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    logger.error({ err: { message: (e as Error).message } }, "error en recepción con escáner");
    return { ok: false, error: "No se pudo completar la operación. Intente de nuevo." };
  }
}

export async function lookupCodeAction(code: string): Promise<Result<ScanProduct | null>> {
  return safe(async () => {
    const { actor } = await requireTenant("purchases.receive");
    return lookupProductForReceipt(actor, String(code).slice(0, 64));
  });
}

export async function searchProductsAction(q: string): Promise<Result<{ id: string; sku: string; name: string }[]>> {
  return safe(async () => {
    const { actor } = await requireTenant("purchases.receive");
    return searchProductsForReceipt(actor, String(q).slice(0, 80));
  });
}

/** Selecciona un producto para un código no registrado y, si se pide (y hay permiso), guarda el código. */
export async function pickProductAction(
  productId: string,
  code: string | null,
  saveCode: boolean,
): Promise<Result<{ product: ScanProduct | null; warning: string | null }>> {
  return safe(async () => {
    const { actor, access } = await requireTenant("purchases.receive");
    let warning: string | null = null;
    if (saveCode && code && hasPermission(access.role, "products.write")) {
      // Si el código no se puede guardar (inválido o ya usado), igual se recibe el producto.
      try {
        await addProductBarcode(actor, productId, { code });
      } catch (e) {
        if (!isDomainError(e)) throw e;
        warning = `No se guardó el código: ${e.message}`;
      }
    }
    return { product: await getProductForReceipt(actor, productId), warning };
  });
}

export interface ScanReceiptPayload {
  idempotencyKey: string;
  supplierId: string;
  warehouseId: string;
  currency: "USD" | "VES";
  supplierInvoice?: string;
  additionalCosts?: string;
  notes?: string;
  lines: { productId: string; quantity: string; unit: string; unitPrice: string; lotNumber?: string; expiresAt?: string }[];
}

/** "1.234,5" (es-VE) o "1234.5" → "1234.5". */
const decimal = (v: string) => (v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v).trim();

export async function submitScanReceiptAction(payload: ScanReceiptPayload): Promise<Result<{ receiptId: string; number: number; replayed: boolean }>> {
  return safe(async () => {
    const { actor } = await requireTenant("purchases.receive");
    const r = await receiveGoods(actor, {
      idempotencyKey: payload.idempotencyKey,
      supplierId: payload.supplierId,
      warehouseId: payload.warehouseId,
      currency: payload.currency,
      supplierInvoice: payload.supplierInvoice || undefined,
      additionalCosts: payload.additionalCosts ? decimal(payload.additionalCosts) : undefined,
      notes: payload.notes || undefined,
      lines: payload.lines.map((l) => ({
        productId: l.productId,
        quantity: decimal(l.quantity),
        unit: l.unit,
        unitPrice: decimal(l.unitPrice),
        lotNumber: l.lotNumber || undefined,
        expiresAt: l.expiresAt || undefined,
      })),
    });
    revalidatePath("/app/recepciones");
    revalidatePath("/app", "layout");
    return { receiptId: r.receiptId, number: r.number, replayed: !!r.replayed };
  });
}
