"use server";

import {
  disableTotp,
  regenerateRecoveryCodes,
  revokeAllSessions,
  revokeOtherSessions,
  revokeSession,
  totpCodeSchema,
} from "@rc/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, str, type FormState } from "@/server/actions";
import { requireVerifiedUser, toUserActor } from "@/server/session";

const PATH = "/cuenta/seguridad";

export async function regenerateCodesAction(
  _: FormState<{ recoveryCodes: string[] }>,
  fd: FormData,
): Promise<FormState<{ recoveryCodes: string[] }>> {
  return runAction(async () => {
    const u = await requireVerifiedUser();
    const { recoveryCodes } = await regenerateRecoveryCodes(await toUserActor(u), totpCodeSchema.parse(str(fd, "code")));
    return { ok: true, message: "Nuevos códigos generados. Los anteriores ya no sirven.", data: { recoveryCodes } };
  });
}

export async function disableMfaAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await requireVerifiedUser();
    await disableTotp(await toUserActor(u), totpCodeSchema.parse(str(fd, "code")));
    revalidatePath(PATH);
    return { ok: true, message: "Verificación en dos pasos desactivada." };
  });
}

export async function revokeSessionAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await requireVerifiedUser();
    const id = str(fd, "sessionId");
    await revokeSession(await toUserActor(u), id);
    if (id === u.sessionId) redirect("/login");
    revalidatePath(PATH);
    return { ok: true, message: "Sesión cerrada." };
  });
}

export async function revokeOthersAction(_: FormState): Promise<FormState> {
  return runAction(async () => {
    const u = await requireVerifiedUser();
    const n = await revokeOtherSessions(await toUserActor(u), u.sessionId);
    revalidatePath(PATH);
    return { ok: true, message: `Se cerraron ${n} sesión(es) en otros dispositivos.` };
  });
}

export async function revokeAllAction(_: FormState): Promise<FormState> {
  return runAction(async () => {
    const u = await requireVerifiedUser();
    await revokeAllSessions(await toUserActor(u));
    redirect("/login");
  });
}
