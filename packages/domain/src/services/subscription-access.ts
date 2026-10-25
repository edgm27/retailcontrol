/** Regla pura: ¿la suscripción permite escribir o solo leer? */
export type SubscriptionStatusValue = "TRIALING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELED";

export interface SubscriptionSnapshot {
  status: SubscriptionStatusValue;
  trialEndsAt: Date | null;
  graceEndsAt: Date | null;
}

export type AccessMode = "full" | "read_only";

/**
 * - TRIALING: completo hasta trialEndsAt; luego solo lectura.
 * - ACTIVE: completo.
 * - PAST_DUE: completo hasta graceEndsAt (período de gracia); luego solo lectura.
 * - SUSPENDED / CANCELED: solo lectura. Nunca se borran datos por impago.
 */
export function subscriptionAccessMode(sub: SubscriptionSnapshot | null, now = new Date()): AccessMode {
  if (!sub) return "read_only";
  switch (sub.status) {
    case "ACTIVE":
      return "full";
    case "TRIALING":
      return sub.trialEndsAt && sub.trialEndsAt.getTime() < now.getTime() ? "read_only" : "full";
    case "PAST_DUE":
      return sub.graceEndsAt && sub.graceEndsAt.getTime() >= now.getTime() ? "full" : "read_only";
    default:
      return "read_only";
  }
}
