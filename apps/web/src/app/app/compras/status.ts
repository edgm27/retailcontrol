export const PO_STATUS: Record<string, { label: string; v: "warning" | "success" | "destructive" | "secondary" | "outline" }> = {
  DRAFT: { label: "Borrador", v: "secondary" },
  APPROVED: { label: "Aprobada", v: "outline" },
  PARTIALLY_RECEIVED: { label: "Recibida parcial", v: "warning" },
  RECEIVED: { label: "Recibida", v: "success" },
  CANCELLED: { label: "Cancelada", v: "destructive" },
};
