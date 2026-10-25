"use server";

import { emailSchema } from "@rc/domain";
import { signIn } from "@/auth";
import { runAction, str, type FormState } from "@/server/actions";

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
