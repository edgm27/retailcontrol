/* Formatos y colores compartidos por el tablero (servidor y cliente). */

export const SERIES = {
  s1: "var(--color-series-1)",
  s2: "var(--color-series-2)",
  s3: "var(--color-series-3)",
  critical: "var(--color-critical)",
  grid: "var(--color-grid)",
} as const;

const oneDec = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 1 });
const moneyFmt = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayFmt = new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short", timeZone: "UTC" });
const dayLongFmt = new Intl.DateTimeFormat("es-VE", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const money = (v: number, cur: string) => `${cur === "VES" ? "Bs." : "USD"} ${moneyFmt.format(v)}`;
/** Escala compacta en español: 950 · 1,5 mil · 2,3 M. */
export const compact = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${oneDec.format(v / 1e6)} M`;
  if (a >= 1e3) return `${oneDec.format(v / 1e3)} mil`;
  return oneDec.format(v);
};
export const moneyCompact = (v: number, cur: string) => `${cur === "VES" ? "Bs." : "$"} ${compact(v)}`;
const asDate = (d: string) => new Date(`${d}T12:00:00Z`);
export const fmtDay = (d: string) => dayFmt.format(asDate(d)).replace(".", "");
export const fmtDayLong = (d: string) => dayLongFmt.format(asDate(d));

