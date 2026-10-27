import "server-only";
import type { SessionContext } from "./session";

/**
 * ¿Puede este usuario crear la empresa de demostración? Solo el administrador inicial
 * (ADMIN_EMAIL), roles de plataforma, o todos si DEMO_DATA_ENABLED=true (entornos de prueba).
 */
export function canCreateDemo(user: Pick<SessionContext, "email" | "platformRole">): boolean {
  if (process.env.DEMO_DATA_ENABLED === "true") return true;
  if (user.platformRole !== "NONE") return true;
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return !!admin && admin === user.email.toLowerCase();
}
