"use server";

import { setPassword } from "@rc/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, str, type FormState } from "@/server/actions";
import { requireVerifiedUser, toUserActor } from "@/server/session";

export async function changeTemporaryPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const res = await runAction(async () => {
    const u = await requireVerifiedUser({ allowPendingPasswordChange: true });
    await setPassword({ ...(await toUserActor(u)), sessionId: u.sessionId }, {
      current: str(fd, "current"),
      next: str(fd, "next"),
      confirm: str(fd, "confirm"),
    });
    return { ok: true, message: "Contraseña actualizada." };
  });
  if (res.ok) {
    revalidatePath("/", "layout");
    redirect("/app");
  }
  return res;
}
