/** Regla pura: ¿la suscripción permite escribir o solo leer? */
export type SubscriptionStatusValue = "TRIALING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELED";

export interface SubscriptionSnapshot {
  status: SubscriptionStatusValue;
  trialEndsAt: Date | null;
  graceEndsAt: Date | null;
  currentPeriodEnd?: Date | null;
}

export type AccessMode = "full" | "read_only";

/** Días de gracia tras el fin del período pagado antes de pasar a solo lectura. */
export const PAYMENT_GRACE_DAYS = 7;

/**
 * - TRIALING: completo hasta trialEndsAt; luego solo lectura.
 * - ACTIVE: completo; si venció el período pagado, completo durante la gracia y luego solo lectura.
 * - PAST_DUE: completo hasta graceEndsAt (período de gracia); luego solo lectura.
 * - SUSPENDED / CANCELED: solo lectura. Nunca se borran datos por impago.
 */
export function subscriptionAccessMode(sub: SubscriptionSnapshot | null, now = new Date()): AccessMode {
  if (!sub) return "read_only";
  switch (sub.status) {
    case "ACTIVE": {
      const end = sub.currentPeriodEnd;
      if (!end) return "full";
      return end.getTime() + PAYMENT_GRACE_DAYS * 86_400_000 >= now.getTime() ? "full" : "read_only";
    }
    case "TRIALING":
      return sub.trialEndsAt && sub.trialEndsAt.getTime() < now.getTime() ? "read_only" : "full";
    case "PAST_DUE":
      return sub.graceEndsAt && sub.graceEndsAt.getTime() >= now.getTime() ? "full" : "read_only";
    default:
      return "read_only";
  }
}

export type SubscriptionPhase = "trial" | "trial_expired" | "active" | "grace" | "expired" | "suspended" | "canceled";

/** Fase legible para mostrar avisos (días restantes, etc.). */
export function subscriptionPhase(sub: SubscriptionSnapshot | null, now = new Date()): { phase: SubscriptionPhase; daysLeft: number | null } {
  const days = (d: Date) => Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
  if (!sub) return { phase: "expired", daysLeft: null };
  switch (sub.status) {
    case "TRIALING":
      if (!sub.trialEndsAt) return { phase: "trial", daysLeft: null };
      return days(sub.trialEndsAt) >= 0 && sub.trialEndsAt.getTime() >= now.getTime()
        ? { phase: "trial", daysLeft: days(sub.trialEndsAt) }
        : { phase: "trial_expired", daysLeft: 0 };
    case "ACTIVE": {
      const end = sub.currentPeriodEnd;
      if (!end || end.getTime() >= now.getTime()) return { phase: "active", daysLeft: end ? days(end) : null };
      const graceEnd = new Date(end.getTime() + PAYMENT_GRACE_DAYS * 86_400_000);
      return graceEnd.getTime() >= now.getTime() ? { phase: "grace", daysLeft: days(graceEnd) } : { phase: "expired", daysLeft: 0 };
    }
    case "PAST_DUE":
      return sub.graceEndsAt && sub.graceEndsAt.getTime() >= now.getTime()
        ? { phase: "grace", daysLeft: days(sub.graceEndsAt) }
        : { phase: "expired", daysLeft: 0 };
    case "SUSPENDED":
      return { phase: "suspended", daysLeft: null };
    default:
      return { phase: "canceled", daysLeft: null };
  }
}
