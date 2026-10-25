"use server";

import { setActiveTenant } from "@rc/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { str } from "@/server/actions";
import { requireVerifiedUser } from "@/server/session";

export async function switchTenantAction(fd: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  // setActiveTenant valida la membresía activa antes de guardar.
  await setActiveTenant(user.userId, user.sessionId, str(fd, "tenantId"));
  revalidatePath("/", "layout");
  redirect("/app");
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
