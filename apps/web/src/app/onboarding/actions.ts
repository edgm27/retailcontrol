"use server";

import { createTenantWithOwner, listPublicPlans, setActiveTenant, validation } from "@rc/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, str, type FormState } from "@/server/actions";
import { requireVerifiedUser, toUserActor } from "@/server/session";

export async function createCompanyAction(_: FormState, fd: FormData): Promise<FormState> {
  const res = await runAction(async () => {
    const user = await requireVerifiedUser();
    const planCode = str(fd, "plan") || "BASICO";
    // Solo planes con precio publicado; el Empresarial se contrata por acuerdo.
    const plan = (await listPublicPlans()).find((p) => p.code === planCode && Number(p.priceMonthly) > 0);
    if (!plan) throw validation("Elija un plan disponible.");
    const { tenant } = await createTenantWithOwner(
      await toUserActor(user),
      { name: str(fd, "name"), legalName: str(fd, "legalName"), rif: str(fd, "rif") },
      { planCode: plan.code },
    );
    await setActiveTenant(user.userId, user.sessionId, tenant.id);
    revalidatePath("/", "layout");
    return { ok: true };
  });
  // El propietario debe activar MFA: requireTenant lo enviará a configurarlo.
  if (res.ok) redirect("/app");
  return res;
}
