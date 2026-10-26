"use server";

import { submitPayment } from "@rc/domain";
import { revalidatePath } from "next/cache";
import { runAction, str, type FormState } from "@/server/actions";
import { requireTenant } from "@/server/session";

export async function submitPaymentAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("billing.manage");
    const r = await submitPayment(actor, {
      planCode: str(fd, "planCode"),
      method: str(fd, "method") as "TRANSFER" | "PAGO_MOVIL" | "OTHER",
      reference: str(fd, "reference"),
      amount: str(fd, "amount"),
      currency: str(fd, "currency") as "USD" | "VES",
      paidOn: str(fd, "paidOn"),
      periodMonths: str(fd, "periodMonths"),
      payerName: str(fd, "payerName"),
      notes: str(fd, "notes"),
    });
    revalidatePath("/app", "layout");
    const warn =
      r.amountUsd && Number(r.amountUsd) + 0.01 < Number(r.expectedUsd)
        ? ` Atención: el monto equivale a USD ${r.amountUsd} y el plan cuesta USD ${r.expectedUsd} por el período elegido.`
        : "";
    return { ok: true, message: `Pago registrado. Lo verificaremos y le avisaremos al aprobarlo.${warn}` };
  });
}
