"use server";

import { createTenantWithOwner, setActiveTenant } from "@rc/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, str, type FormState } from "@/server/actions";
import { requireVerifiedUser, toUserActor } from "@/server/session";

export async function createCompanyAction(_: FormState, fd: FormData): Promise<FormState> {
  const res = await runAction(async () => {
    const user = await requireVerifiedUser();
    const { tenant } = await createTenantWithOwner(await toUserActor(user), {
      name: str(fd, "name"),
      legalName: str(fd, "legalName"),
      rif: str(fd, "rif"),
    });
    await setActiveTenant(user.userId, user.sessionId, tenant.id);
    revalidatePath("/", "layout");
    return { ok: true };
  });
  // El propietario debe activar MFA: requireTenant lo enviará a configurarlo.
  if (res.ok) redirect("/app");
  return res;
}
