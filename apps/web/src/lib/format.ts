/** Formatos es-VE: coma decimal, punto de miles. */
export function fmtNumber(v: string | number, maxDecimals = 3): string {
  const n = typeof v === "number" ? v : Number(v);
  return n.toLocaleString("es-VE", { maximumFractionDigits: maxDecimals });
}

export function fmtQty(v: string | number, unit: string): string {
  return `${fmtNumber(v)} ${unit}`;
}

export function fmtMoney(v: string | number, currency: string = "USD"): string {
  const n = typeof v === "number" ? v : Number(v);
  const prefix = currency === "VES" ? "Bs." : "USD";
  return `${prefix} ${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(d: Date | string, withTime = false): string {
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d) : d;
  return date.toLocaleString("es-VE", {
    timeZone: "America/Caracas",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export const MOVEMENT_LABELS: Record<string, string> = {
  RECEIPT: "Entrada",
  ISSUE: "Salida",
  RETURN_IN: "Devolución de cliente",
  RETURN_OUT: "Devolución a proveedor",
  ADJUSTMENT_IN: "Ajuste (+)",
  ADJUSTMENT_OUT: "Ajuste (−)",
  WASTE: "Merma",
  TRANSFER_OUT: "Transferencia (salida)",
  TRANSFER_IN: "Transferencia (entrada)",
  COUNT_ADJUSTMENT: "Ajuste por conteo",
  REVERSAL: "Reverso",
};

export const LOT_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Disponible",
  QUARANTINE: "Cuarentena",
  DAMAGED: "Dañado",
  RECALLED: "Retirado",
  EXPIRED: "Vencido",
  DEPLETED: "Agotado",
};

export const UNIT_LABELS: Record<string, string> = {
  UND: "Unidad",
  KG: "Kilogramo",
  G: "Gramo",
  L: "Litro",
  ML: "Mililitro",
  M: "Metro",
  CM: "Centímetro",
};
