"use server";

import { createProduct } from "@rc/domain";
import { revalidatePath } from "next/cache";
import { runAction, str, type FormState } from "@/server/actions";
import { requireTenant } from "@/server/session";

export async function createProductAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("products.write");
    const p = await createProduct(actor, {
      sku: str(fd, "sku"),
      name: str(fd, "name"),
      baseUnit: str(fd, "baseUnit") || "UND",
      lotTracking: fd.get("lotTracking") === "on",
      requiresExpiry: fd.get("requiresExpiry") === "on",
      minStock: str(fd, "minStock") || undefined,
    });
    revalidatePath("/app/productos");
    return { ok: true, message: `Producto ${p.sku} creado.` };
  });
}
