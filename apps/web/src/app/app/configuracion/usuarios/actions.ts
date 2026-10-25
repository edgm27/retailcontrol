"use server";

import { changeMemberRole, inviteMember, revokeInvitation, roleSchema, setMemberStatus } from "@rc/domain";
import { revalidatePath } from "next/cache";
import { runAction, str, type FormState } from "@/server/actions";
import { sendEmail } from "@/server/email";
import { logger } from "@/server/logger";
import { requireTenant } from "@/server/session";

const PATH = "/app/configuracion/usuarios";

export async function inviteAction(_: FormState<{ link: string }>, fd: FormData): Promise<FormState<{ link: string }>> {
  return runAction(async () => {
    const { actor, access } = await requireTenant("members.manage");
    const email = str(fd, "email");
    const inv = await inviteMember(actor, { email, role: roleSchema.parse(str(fd, "role")) });
    const base = process.env.AUTH_URL ?? "http://localhost:3000";
    const link = `${base}/invitacion/${inv.token}`;
    await sendEmail({
      to: email.trim().toLowerCase(),
      subject: `Invitación a ${access.tenantName} en RetailControl`,
      text: `Le invitaron a ${access.tenantName}. Entre con este mismo correo y acepte aquí (vence en 72 horas):\n\n${link}`,
      actionUrl: link,
    }).catch((e) => logger.warn({ err: { message: (e as Error).message } }, "no se pudo enviar el correo de invitación"));
    revalidatePath(PATH);
    return { ok: true, message: "Invitación creada. También puede compartir este enlace de forma segura:", data: { link } };
  });
}

export async function changeRoleAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("members.manage");
    await changeMemberRole(actor, str(fd, "membershipId"), roleSchema.parse(str(fd, "role")));
    revalidatePath(PATH);
    return { ok: true, message: "Rol actualizado." };
  });
}

export async function toggleMemberAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("members.manage");
    const status = str(fd, "status") === "ACTIVE" ? "ACTIVE" : "DISABLED";
    await setMemberStatus(actor, str(fd, "membershipId"), status);
    revalidatePath(PATH);
    return { ok: true, message: status === "ACTIVE" ? "Miembro reactivado." : "Miembro desactivado." };
  });
}

export async function revokeInvitationAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("members.manage");
    await revokeInvitation(actor, str(fd, "invitationId"));
    revalidatePath(PATH);
    return { ok: true, message: "Invitación revocada." };
  });
}
