import { withContext } from "@rc/db";
import { commitProductImport, createProduct, IMPORT_TEMPLATE, parseCsv, previewProductImport } from "@rc/domain";
import { describe, expect, it } from "vitest";
import { actorFor, addMember, createCompany, createUser } from "./helpers";

async function setup() {
  const o = await createUser("imp-dueno");
  const c = await createCompany(o, "PROFESIONAL", "Ferretería Importa");
  return { owner: await actorFor(o, c.tenant.id), tenantId: c.tenant.id };
}

const count = (tenantId: string) => withContext({ tenantId }, (tx) => tx.product.count({ where: { tenantId } }));

describe("Importación CSV de productos", () => {
  it("la plantilla se importa completa (con lotes, vencimiento y código de barras)", async () => {
    const { owner, tenantId } = await setup();
    const p = await previewProductImport(owner, IMPORT_TEMPLATE);
    expect(p.counts).toEqual({ crear: 3, actualizar: 0, omitir: 0, error: 0 });
    const r = await commitProductImport(owner, IMPORT_TEMPLATE);
    expect(r).toEqual({ created: 3, updated: 0, skipped: 0 });
    const leche = await withContext({ tenantId }, (tx) => tx.product.findFirstOrThrow({ where: { tenantId, sku: "LECHE-UHT-1L" } }));
    expect(leche).toMatchObject({ lotTracking: true, requiresExpiry: true });
    expect(leche.minStock?.toString()).toBe("12");
    const code = await withContext({ tenantId }, (tx) => tx.productBarcode.findFirst({ where: { tenantId, code: "7590000000011" } }));
    expect(code).not.toBeNull();
    const audit = await withContext({ tenantId }, (tx) => tx.auditEvent.findFirstOrThrow({ where: { tenantId, action: "product.imported" } }));
    expect(audit.metadata).toMatchObject({ created: 3 });
  });

  it("todo o nada: una fila con error impide importar; informa errores por fila", async () => {
    const { owner, tenantId } = await setup();
    const csv = "sku;nombre;unidad;stock_minimo\nOK-1;Bueno;UND;5\nMAL 2;Malo;LIBRAS;-3\nOK-1;Repetido;UND;\n";
    const p = await previewProductImport(owner, csv);
    expect(p.counts.error).toBe(2);
    const bad = p.rows.find((r) => r.line === 3)!;
    expect(bad.errors.join(" ")).toMatch(/SKU/);
    expect(bad.errors.join(" ")).toMatch(/Unidad/);
    expect(bad.errors.join(" ")).toMatch(/mínimo/);
    expect(p.rows.find((r) => r.line === 4)!.errors.join(" ")).toMatch(/repetido.*fila 2/);
    await expect(commitProductImport(owner, csv)).rejects.toThrow(/no se importó nada/);
    expect(await count(tenantId)).toBe(0);
  });

  it("SKU existente: se omite o se actualiza según el modo; acepta coma, comillas y alias de columnas", async () => {
    const { owner, tenantId } = await setup();
    await createProduct(owner, { sku: "ARROZ", name: "Arroz viejo" });
    const csv = 'SKU,Descripción,Unidad,Mínimo\nARROZ,"Arroz 1 kg, tipo I",kilos,"2,5"\nNUEVO,Nuevo,UND,\n';
    const { delimiter } = parseCsv(csv);
    expect(delimiter).toBe(",");
    const skip = await previewProductImport(owner, csv);
    expect(skip.counts).toMatchObject({ crear: 1, omitir: 1 });
    const upd = await commitProductImport(owner, csv, "actualizar");
    expect(upd).toEqual({ created: 1, updated: 1, skipped: 0 });
    const arroz = await withContext({ tenantId }, (tx) => tx.product.findFirstOrThrow({ where: { tenantId, sku: "ARROZ" } }));
    expect(arroz.name).toBe("Arroz 1 kg, tipo I");
    expect(arroz.minStock?.toString()).toBe("2.5");
    // El modo "actualizar" no cambia la unidad base de un producto existente.
    expect(arroz.baseUnit).toBe("UND");
  });

  it("aislamiento: el mismo SKU de otra empresa no interfiere; un código de barras ajeno no se reutiliza dentro de la empresa", async () => {
    const a = await setup();
    const b = await setup();
    await commitProductImport(a.owner, "sku;nombre;codigo_barras\nCOMUN;De A;111122223333\n");
    const p = await previewProductImport(b.owner, "sku;nombre;codigo_barras\nCOMUN;De B;111122223333\n");
    expect(p.counts).toEqual({ crear: 1, actualizar: 0, omitir: 0, error: 0 });
    await commitProductImport(b.owner, "sku;nombre;codigo_barras\nCOMUN;De B;111122223333\n");
    const otro = await previewProductImport(b.owner, "sku;nombre;codigo_barras\nOTRO;Otro;111122223333\n");
    expect(otro.rows[0]!.errors.join(" ")).toMatch(/ya pertenece al producto COMUN/);
  });

  it("valida encabezado, límites y permisos", async () => {
    const { owner, tenantId } = await setup();
    await expect(previewProductImport(owner, "codigo_x;otra\n1;2\n")).rejects.toThrow(/encabezado/);
    await expect(previewProductImport(owner, "sku;nombre\n")).rejects.toThrow(/no tiene filas/);
    const big = "sku;nombre\n" + Array.from({ length: 5001 }, (_, i) => `S${i};N${i}`).join("\n");
    await expect(previewProductImport(owner, big)).rejects.toThrow(/Máximo/);
    const u = await createUser("imp-lector");
    await addMember(tenantId, u, "READONLY");
    await expect(previewProductImport(await actorFor(u, tenantId), IMPORT_TEMPLATE)).rejects.toThrow();
  });
});
