"use server";

import { enforceRateLimit, generateDemoCompany, isDomainError, listUserTenants } from "@rc/domain";
import { revalidatePath } from "next/cache";
import { canCreateDemo } from "@/server/demo";
import { logger } from "@/server/logger";
import { getRequestMeta, requireVerifiedUser } from "@/server/session";
import type { FormState } from "@/server/actions";

export async function createDemoAction(_: FormState): Promise<FormState> {
  const user = await requireVerifiedUser();
  if (!canCreateDemo(user)) return { ok: false, error: "No tiene permiso para crear la empresa de demostración." };
  const tenants = await listUserTenants(user.userId);
  if (tenants.some((t) => t.name.includes("(generando datos…)"))) {
    return { ok: false, error: "Ya se está generando una empresa de demostración. Espere unos minutos y actualice." };
  }
  try {
    await enforceRateLimit(`demo-create:${user.userId}`, 3, 24 * 3600);
  } catch (e) {
    if (isDomainError(e)) return { ok: false, error: e.message };
    throw e;
  }
  const meta = await getRequestMeta();
  // Se genera en segundo plano (tarda 1–5 minutos): la empresa aparece de inmediato como «generando datos…».
  void generateDemoCompany({ userId: user.userId, email: user.email, meta })
    .then((r) => logger.info({ event: "demo_generated", tenantId: r.tenantId, products: r.products, sales: r.sales }, "empresa de demostración lista"))
    .catch((e) => logger.error({ event: "demo_failed", err: { message: (e as Error).message } }, "falló la empresa de demostración"));
  await new Promise((r) => setTimeout(r, 1500)); // deja que la empresa se cree antes de recargar la lista
  revalidatePath("/empresas");
  return {
    ok: true,
    message: "Generando la empresa de demostración. Tarda entre 1 y 5 minutos: actualice esta página y, cuando su nombre ya no diga «generando datos…», entre a ella.",
  };
}
