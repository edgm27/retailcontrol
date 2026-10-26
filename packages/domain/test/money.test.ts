import { Prisma } from "@rc/db";
import { describe, expect, it } from "vitest";
import { convertAmount, documentTotals, prorateByValue, roundDoc } from "../src/money";

const D = (v: string) => new Prisma.Decimal(v);

describe("Conversión USD ↔ Bs. con decimales exactos", () => {
  it("USD → VES multiplica; VES → USD divide; sin redondeo intermedio", () => {
    expect(convertAmount(D("10"), "USD", "VES", D("36.5432")).toString()).toBe("365.432");
    expect(convertAmount(D("100"), "VES", "USD", D("36.5")).toDecimalPlaces(6).toString()).toBe("2.739726");
    expect(convertAmount(D("5"), "USD", "USD", null).toString()).toBe("5");
  });
  it("exige tasa positiva para convertir", () => {
    expect(() => convertAmount(D("1"), "USD", "VES", null)).toThrow(/tasa/);
    expect(() => convertAmount(D("1"), "USD", "VES", D("0"))).toThrow(/tasa/);
  });
  it("redondeo de documento: 2 decimales, mitad hacia arriba", () => {
    expect(roundDoc(D("2.345")).toString()).toBe("2.35");
    expect(roundDoc(D("2.344999")).toString()).toBe("2.34");
  });
  it("evita el error típico de coma flotante (0,1 + 0,2)", () => {
    expect(D("0.1").plus(D("0.2")).toString()).toBe("0.3");
  });
});

describe("Totales de documento", () => {
  it("suma líneas a precisión completa y redondea al final; IVA por línea configurable", () => {
    const t = documentTotals([
      { quantity: D("3"), unitPrice: D("1.115"), taxRate: D("16") },
      { quantity: D("1"), unitPrice: D("0.005"), taxRate: D("0") },
    ]);
    expect(t.subtotal.toString()).toBe("3.35"); // 3.345 + 0.005 = 3.35
    expect(t.tax.toString()).toBe("0.54"); // 0.5352
    expect(t.total.toString()).toBe("3.89");
  });
});

describe("Prorrateo de gastos adicionales", () => {
  it("reparte por valor y la suma es exactamente el gasto", () => {
    const parts = prorateByValue([D("100"), D("200"), D("0.01")], D("10"));
    expect(parts.reduce((a, p) => a.plus(p), D("0")).toString()).toBe("10");
    expect(parts[1]!.greaterThan(parts[0]!)).toBe(true);
  });
  it("si todas las líneas valen 0, reparte en partes iguales", () => {
    const parts = prorateByValue([D("0"), D("0"), D("0")], D("1"));
    expect(parts.reduce((a, p) => a.plus(p), D("0")).toString()).toBe("1");
  });
});
