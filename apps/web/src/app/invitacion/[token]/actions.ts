"use server";

import { acceptInvitation, setActiveTenant } from "@rc/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, str, type FormState } from "@/server/actions";
import { requireVerifiedUser, toUserActor } from "@/server/session";

export async function acceptInvitationAction(_: FormState, fd: FormData): Promise<FormState> {
  const res = await runAction(async () => {
    const user = await requireVerifiedUser();
    const { tenantId } = await acceptInvitation(await toUserActor(user), str(fd, "token"));
    await setActiveTenant(user.userId, user.sessionId, tenantId);
    revalidatePath("/", "layout");
    return { ok: true };
  });
  if (res.ok) redirect("/app");
  return res;
}
