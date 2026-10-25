import { Prisma } from "@rc/db";
import { describe, expect, it } from "vitest";
import { parseQuantity, toBaseQuantity } from "../src/units";

const D = (v: string) => new Prisma.Decimal(v);

describe("Lectura de cantidades (es-VE)", () => {
  it.each([
    ["1,5", "1.5"],
    ["1.234,5", "1234.5"],
    ["12", "12"],
    [" 0,250 ", "0.25"],
  ])("%s => %s", (inp, out) => expect(parseQuantity(inp).toString()).toBe(out));
  it("rechaza texto, notación invertida o números enormes", () => {
    expect(() => parseQuantity("abc")).toThrow();
    expect(() => parseQuantity("1,234.5")).toThrow(/coma/);
    expect(() => parseQuantity("1e30")).toThrow();
  });
});

describe("Conversión exacta a unidad base", () => {
  const harina = { baseUnit: "UND", packaging: [{ code: "BULTO", factorToBase: "20" }, { code: "CAJA", factorToBase: "24" }] };
  it("presentaciones: 2 bultos = 40 unidades", () => {
    expect(toBaseQuantity(D("2"), "BULTO", harina).toString()).toBe("40");
  });
  it("unidad entera: no permite 1,5 UND ni media caja de 24 que dé fracción", () => {
    expect(() => toBaseQuantity(D("1.5"), "UND", harina)).toThrow(/decimal/);
    expect(toBaseQuantity(D("0.5"), "CAJA", harina).toString()).toBe("12");
    expect(() => toBaseQuantity(D("0.1"), "CAJA", harina)).toThrow(/decimal/);
  });
  it("masa: 250 g = 0,25 kg exacto; 1 g sobre kg con 3 decimales = 0,001", () => {
    const queso = { baseUnit: "KG" };
    expect(toBaseQuantity(D("250"), "G", queso).toString()).toBe("0.25");
    expect(toBaseQuantity(D("1"), "G", queso).toString()).toBe("0.001");
    expect(() => toBaseQuantity(D("0.5"), "G", queso)).toThrow(/decimal/);
  });
  it("volumen y longitud: 1,5 L = 1500 ml; 2,35 m = 235 cm", () => {
    expect(toBaseQuantity(D("1.5"), "L", { baseUnit: "ML" }).toString()).toBe("1500");
    expect(toBaseQuantity(D("2.35"), "M", { baseUnit: "CM" }).toString()).toBe("235");
  });
  it("valida dimensiones: no convierte kg a litros ni unidades a metros", () => {
    expect(() => toBaseQuantity(D("1"), "L", { baseUnit: "KG" })).toThrow(/dimensiones/);
    expect(() => toBaseQuantity(D("1"), "M", { baseUnit: "UND" })).toThrow(/dimensiones/);
    expect(() => toBaseQuantity(D("1"), "XYZ", { baseUnit: "UND" })).toThrow(/desconocida/);
  });
});
