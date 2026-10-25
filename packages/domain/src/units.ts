import { Prisma } from "@rc/db";
import { validation } from "./errors";

type Decimal = Prisma.Decimal;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/**
 * Catálogo de unidades. Las conversiones solo se permiten dentro de la misma
 * dimensión y son exactas (aritmética decimal, sin coma flotante).
 * `factor` = cuántas unidades canónicas de la dimensión contiene la unidad.
 */
export type Dimension = "COUNT" | "MASS" | "VOLUME" | "LENGTH";

export interface UnitDef {
  code: string;
  name: string;
  dimension: Dimension;
  factor: number;
  /** Decimales permitidos en cantidades expresadas en esta unidad base. */
  decimals: number;
}

export const UNITS: Record<string, UnitDef> = {
  UND: { code: "UND", name: "Unidad", dimension: "COUNT", factor: 1, decimals: 0 },
  KG: { code: "KG", name: "Kilogramo", dimension: "MASS", factor: 1000, decimals: 3 },
  G: { code: "G", name: "Gramo", dimension: "MASS", factor: 1, decimals: 0 },
  L: { code: "L", name: "Litro", dimension: "VOLUME", factor: 1000, decimals: 3 },
  ML: { code: "ML", name: "Mililitro", dimension: "VOLUME", factor: 1, decimals: 0 },
  M: { code: "M", name: "Metro", dimension: "LENGTH", factor: 100, decimals: 2 },
  CM: { code: "CM", name: "Centímetro", dimension: "LENGTH", factor: 1, decimals: 0 },
};
export const BASE_UNIT_CODES = Object.keys(UNITS);

export interface PackagingUnit {
  code: string;
  factorToBase: Prisma.Decimal.Value;
}

export interface ProductUnitsInfo {
  baseUnit: string;
  packaging?: PackagingUnit[];
}

/**
 * Lee una cantidad escrita por el usuario. Acepta coma decimal (es-VE):
 * "1,5" = 1.5; "1.234,5" = 1234.5. Rechaza notación ambigua o no numérica.
 */
export function parseQuantity(input: string | number | Decimal): Decimal {
  if (Prisma.Decimal.isDecimal(input)) return input as Decimal;
  let s = String(input).trim().replace(/\s+/g, "");
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") < s.lastIndexOf(".")) throw validation("Use la coma para los decimales (ej.: 1.234,5).");
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw validation("Cantidad inválida.");
  const d = D(s);
  if (d.abs().greaterThan("1000000000000")) throw validation("Cantidad demasiado grande.");
  return d;
}

/**
 * Convierte una cantidad a la unidad base del producto.
 * - Presentaciones del producto (CAJA = 24 UND) por su factor.
 * - Unidades del catálogo de la misma dimensión (G → KG).
 * El resultado debe respetar los decimales de la unidad base.
 */
export function toBaseQuantity(quantity: Decimal, unit: string, product: ProductUnitsInfo): Decimal {
  const base = UNITS[product.baseUnit];
  if (!base) throw validation(`Unidad base desconocida: ${product.baseUnit}`);
  const code = unit.trim().toUpperCase();
  let result: Decimal;
  const pack = product.packaging?.find((p) => p.code.toUpperCase() === code);
  if (code === base.code) {
    result = quantity;
  } else if (pack) {
    result = quantity.times(D(pack.factorToBase));
  } else {
    const from = UNITS[code];
    if (!from) throw validation(`Unidad desconocida: ${unit}`);
    if (from.dimension !== base.dimension) {
      throw validation(`No se puede convertir ${from.name} a ${base.name} (dimensiones distintas).`);
    }
    result = quantity.times(from.factor).dividedBy(base.factor);
  }
  if (result.decimalPlaces() > base.decimals) {
    throw validation(
      `La cantidad no es compatible con la unidad ${base.name}: admite ${base.decimals} decimal(es).`,
      { base: base.code, value: result.toString() },
    );
  }
  return result;
}

export function formatQuantity(q: Prisma.Decimal.Value, unit: string): string {
  const def = UNITS[unit];
  const n = Number(D(q).toFixed(def?.decimals ?? 3));
  return `${n.toLocaleString("es-VE", { maximumFractionDigits: def?.decimals ?? 3 })} ${unit}`;
}
