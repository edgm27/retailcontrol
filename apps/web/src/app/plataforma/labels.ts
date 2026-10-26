export const PHASE_LABELS: Record<string, string> = {
  trial: "En prueba",
  trial_expired: "Prueba vencida",
  active: "Activa",
  grace: "En gracia",
  expired: "Vencida",
  suspended: "Suspendida",
  canceled: "Cancelada",
};
export const PHASE_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary" | "default"> = {
  trial: "default",
  trial_expired: "destructive",
  active: "success",
  grace: "warning",
  expired: "destructive",
  suspended: "destructive",
  canceled: "secondary",
};
export const usd = (v: number | string) => `USD ${Number(v).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
