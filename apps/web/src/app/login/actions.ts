"use server";

import { authenticateWithPassword, createUserSession, emailSchema } from "@rc/domain";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { runAction, str, type FormState } from "@/server/actions";
import { getRequestMeta } from "@/server/session";
import { setSessionCookie } from "@/server/session-cookie";

function safeNext(next: string): string {
  // Solo rutas internas: evita redirecciones abiertas.
  return next.startsWith("/") && !next.startsWith("//") ? next : "/app";
}

export async function requestMagicLink(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const email = emailSchema.parse(str(fd, "email"));
    await signIn("email", { email, redirectTo: safeNext(str(fd, "next")) });
    return { ok: true };
  });
}

export async function signInWithGoogle(fd: FormData): Promise<void> {
  await signIn("google", { redirectTo: safeNext(str(fd, "next")) });
}

export async function signInWithPassword(_: FormState, fd: FormData): Promise<FormState> {
  const res = await runAction(async () => {
    const meta = await getRequestMeta();
    const { userId } = await authenticateWithPassword(str(fd, "email"), str(fd, "password"), meta);
    const { sessionToken, expires } = await createUserSession(userId, meta);
    await setSessionCookie(sessionToken, expires);
    return { ok: true };
  });
  // Si tiene MFA activo, /app lo enviará a /mfa/verificar.
  if (res.ok) redirect(safeNext(str(fd, "next")));
  return res;
}
