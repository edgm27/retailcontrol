"use server";

import { reviewPayment, setPaymentInstructions, updatePlan, updateTenantSubscription } from "@rc/domain";
import { revalidatePath } from "next/cache";
import { runAction, str, type FormState } from "@/server/actions";
import { requirePlatform } from "@/server/session";

export async function reviewPaymentAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requirePlatform();
    const decision = str(fd, "decision") === "APPROVE" ? "APPROVE" : "REJECT";
    const r = await reviewPayment(actor, str(fd, "paymentId"), { decision, note: str(fd, "note") });
    revalidatePath("/plataforma", "layout");
    return {
      ok: true,
      message: r.status === "APPROVED" ? `Pago aprobado. Suscripción activa hasta ${r.periodEnd?.toISOString().slice(0, 10)}.` : "Pago rechazado.",
    };
  });
}

export async function updateTenantAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requirePlatform();
    const kind = str(fd, "kind");
    await updateTenantSubscription(actor, str(fd, "tenantId"), {
      reason: str(fd, "reason"),
      ...(kind === "plan" ? { planCode: str(fd, "planCode") } : {}),
      ...(kind === "trial" ? { extendTrialDays: str(fd, "days") } : {}),
      ...(kind === "status" ? { status: str(fd, "status") as "REACTIVATE" | "SUSPENDED" | "CANCELED" } : {}),
    });
    revalidatePath("/plataforma", "layout");
    return { ok: true, message: "Cambio aplicado y registrado en auditoría." };
  });
}

export async function updatePlanAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requirePlatform();
    await updatePlan(actor, str(fd, "code"), {
      name: str(fd, "name"),
      description: str(fd, "description"),
      priceMonthly: str(fd, "priceMonthly"),
      maxUsers: str(fd, "maxUsers"),
      maxBranches: str(fd, "maxBranches"),
      active: fd.get("active") === "on",
    });
    revalidatePath("/plataforma", "layout");
    revalidatePath("/");
    return { ok: true, message: "Plan actualizado." };
  });
}

export async function paymentInstructionsAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requirePlatform();
    await setPaymentInstructions(actor, str(fd, "instructions"));
    revalidatePath("/plataforma", "layout");
    return { ok: true, message: "Instrucciones guardadas. Las empresas las verán en Suscripción." };
  });
}
