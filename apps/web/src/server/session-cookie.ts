import "server-only";
import { cookies } from "next/headers";

/** Misma cookie que usa Auth.js, para que ambos métodos de acceso compartan sesión. */
export async function setSessionCookie(token: string, expires: Date) {
  const secure = (process.env.AUTH_URL ?? "").startsWith("https://");
  (await cookies()).set(secure ? "__Secure-authjs.session-token" : "authjs.session-token", token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires,
  });
}
