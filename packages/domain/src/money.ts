import { Prisma } from "@rc/db";
import { validation } from "./errors";

type Decimal = Prisma.Decimal;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
export type CurrencyCode = "USD" | "VES";

/**
 * Reglas monetarias (ver docs/venezuela-localization.md):
 * - Tasa = bolívares por 1 USD, con hasta 8 decimales, tal como la publica la fuente.
 * - Las conversiones usan precisión completa; NO se redondea en pasos intermedios.
 * - Costos unitarios: 6 decimales. Totales de documento: 2 decimales, ROUND_HALF_UP.
 */
export const DOC_DECIMALS = 2;
export const UNIT_COST_DECIMALS = 6;

export function convertAmount(amount: Decimal, from: CurrencyCode, to: CurrencyCode, rate: Decimal | null): Decimal {
  if (from === to) return amount;
  if (!rate || rate.lessThanOrEqualTo(0)) throw validation("Se requiere una tasa de cambio válida para convertir entre USD y Bs.");
  return from === "USD" ? amount.times(rate) : amount.dividedBy(rate);
}

export function roundDoc(v: Decimal): Decimal {
  return v.toDecimalPlaces(DOC_DECIMALS, Prisma.Decimal.ROUND_HALF_UP);
}

export function roundUnitCost(v: Decimal): Decimal {
  return v.toDecimalPlaces(UNIT_COST_DECIMALS, Prisma.Decimal.ROUND_HALF_UP);
}

export interface PricedLine {
  quantity: Decimal;
  unitPrice: Decimal;
  taxRate?: Decimal;
}

/** Totales de documento: cada línea a precisión completa; se redondea al final. */
export function documentTotals(lines: PricedLine[]) {
  let subtotal = D(0);
  let tax = D(0);
  for (const l of lines) {
    const amount = l.quantity.times(l.unitPrice);
    subtotal = subtotal.plus(amount);
    if (l.taxRate) tax = tax.plus(amount.times(l.taxRate).dividedBy(100));
  }
  const s = roundDoc(subtotal);
  const t = roundDoc(tax);
  return { subtotal: s, tax: t, total: s.plus(t) };
}

/**
 * Prorratea gastos adicionales (flete, acarreo) entre líneas según su valor.
 * La suma de las partes es EXACTAMENTE el gasto (la diferencia de redondeo va a la última línea).
 */
export function prorateByValue(values: Decimal[], extra: Decimal): Decimal[] {
  if (extra.isZero() || values.length === 0) return values.map(() => D(0));
  const total = values.reduce((a, v) => a.plus(v), D(0));
  if (total.isZero()) {
    const each = extra.dividedBy(values.length).toDecimalPlaces(UNIT_COST_DECIMALS);
    return values.map((_, i) => (i === values.length - 1 ? extra.minus(each.times(values.length - 1)) : each));
  }
  const parts = values.map((v) => extra.times(v).dividedBy(total).toDecimalPlaces(UNIT_COST_DECIMALS));
  const diff = extra.minus(parts.reduce((a, p) => a.plus(p), D(0)));
  parts[parts.length - 1] = parts[parts.length - 1]!.plus(diff);
  return parts;
}
