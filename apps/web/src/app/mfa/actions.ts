"use server";

import { confirmTotpEnrollment, recoveryCodeSchema, totpCodeSchema, verifySessionMfa } from "@rc/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, str, type FormState } from "@/server/actions";
import { requireSession, toUserActor } from "@/server/session";

export async function confirmEnrollmentAction(
  _: FormState<{ recoveryCodes: string[] }>,
  fd: FormData,
): Promise<FormState<{ recoveryCodes: string[] }>> {
  return runAction(async () => {
    const s = await requireSession();
    const code = totpCodeSchema.parse(str(fd, "code"));
    const { recoveryCodes } = await confirmTotpEnrollment(await toUserActor(s), s.sessionId, code);
    // Cambió el estado de autenticación: invalida la caché del enrutador del cliente.
    revalidatePath("/", "layout");
    return { ok: true, message: "Verificación en dos pasos activada.", data: { recoveryCodes } };
  });
}

export async function verifyTotpAction(_: FormState, fd: FormData): Promise<FormState> {
  const res = await runAction(async () => {
    const s = await requireSession();
    const code = totpCodeSchema.parse(str(fd, "code"));
    await verifySessionMfa(await toUserActor(s), s.sessionId, "totp", code);
    revalidatePath("/", "layout");
    return { ok: true };
  });
  if (res.ok) redirect("/app");
  return res;
}

export async function verifyRecoveryAction(_: FormState, fd: FormData): Promise<FormState> {
  const res = await runAction(async () => {
    const s = await requireSession();
    const code = recoveryCodeSchema.parse(str(fd, "recoveryCode"));
    await verifySessionMfa(await toUserActor(s), s.sessionId, "recovery", code);
    revalidatePath("/", "layout");
    return { ok: true };
  });
  if (res.ok) redirect("/cuenta/seguridad?recuperacion=1");
  return res;
}
