"use server";

import {
  createMemberUser,
  removeMemberUser,
  resetMemberMfa,
  resetMemberPassword,
  revokeInvitation,
  updateMemberUser,
} from "@rc/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, str, type FormState } from "@/server/actions";
import { requireTenant } from "@/server/session";

const PATH = "/app/configuracion/usuarios";

export type Credentials = { email: string; password: string | null; note: string };

export async function createUserAction(_: FormState<Credentials>, fd: FormData): Promise<FormState<Credentials>> {
  return runAction<Credentials>(async () => {
    const { actor } = await requireTenant("members.manage");
    const email = str(fd, "email").trim().toLowerCase();
    const password = str(fd, "tempPassword").trim();
    const res = await createMemberUser(actor, {
      email,
      name: str(fd, "name"),
      role: str(fd, "role"),
      tempPassword: password,
      mfaRequired: fd.get("mfaRequired") === "on",
    });
    revalidatePath(PATH);
    if (res.kind === "existing_account") {
      return {
        ok: true,
        message: "Ese correo ya tenía una cuenta en RetailControl: se agregó a la empresa con el rol indicado.",
        data: { email, password: null, note: "Entrará con su contraseña actual (la clave temporal no se aplicó)." },
      };
    }
    return {
      ok: true,
      message: res.kind === "created" ? "Usuario creado." : "Usuario reactivado con una nueva clave temporal.",
      data: { email, password, note: "Entréguele estos datos por un medio seguro. Deberá cambiar la clave al ingresar." },
    };
  });
}

export async function updateUserAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("members.manage");
    const status = str(fd, "status");
    await updateMemberUser(actor, str(fd, "membershipId"), {
      ...(fd.has("name") ? { name: str(fd, "name") } : {}),
      ...(fd.has("role") ? { role: str(fd, "role") } : {}),
      ...(status === "ACTIVE" || status === "DISABLED" ? { status } : {}),
    });
    revalidatePath(PATH, "layout");
    return { ok: true, message: "Cambios guardados." };
  });
}

export async function setMfaAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("members.manage");
    const id = str(fd, "membershipId");
    if (str(fd, "intent") === "activar") {
      await updateMemberUser(actor, id, { mfaRequired: true });
      revalidatePath(PATH, "layout");
      return { ok: true, message: "2FA activada: en su próximo ingreso deberá vincular Google Authenticator (QR o enlace)." };
    }
    if (fd.get("managed") === "1") {
      const r = await resetMemberMfa(actor, id);
      revalidatePath(PATH, "layout");
      return { ok: true, message: r.factorRemoved ? "2FA desactivada y app desvinculada. Sus sesiones se cerraron." : "2FA desactivada." };
    }
    await updateMemberUser(actor, id, { mfaRequired: false });
    revalidatePath(PATH, "layout");
    return { ok: true, message: "La empresa ya no exige 2FA a este usuario." };
  });
}

export async function resetPasswordAction(_: FormState<Credentials>, fd: FormData): Promise<FormState<Credentials>> {
  return runAction(async () => {
    const { actor } = await requireTenant("members.manage");
    const password = str(fd, "tempPassword").trim();
    await resetMemberPassword(actor, str(fd, "membershipId"), password);
    revalidatePath(PATH, "layout");
    return {
      ok: true,
      message: "Clave temporal asignada. Se cerraron sus sesiones abiertas.",
      data: { email: str(fd, "email"), password, note: "Deberá cambiarla en su próximo ingreso." },
    };
  });
}

export async function removeUserAction(_: FormState, fd: FormData): Promise<FormState> {
  const res = await runAction(async () => {
    const { actor } = await requireTenant("members.manage");
    if (fd.get("confirm") !== "on") return { ok: false, error: "Marque la casilla para confirmar la eliminación." };
    await removeMemberUser(actor, str(fd, "membershipId"));
    return { ok: true };
  });
  if (res.ok) {
    revalidatePath(PATH);
    redirect(`${PATH}?eliminado=1`);
  }
  return res;
}

export async function revokeInvitationAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("members.manage");
    await revokeInvitation(actor, str(fd, "invitationId"));
    revalidatePath(PATH);
    return { ok: true, message: "Invitación revocada." };
  });
}
