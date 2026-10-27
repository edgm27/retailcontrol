import { Prisma, withTenant } from "@rc/db";
import { validation } from "../errors";
import { assertPermission } from "../rbac";
import { createProductSchema } from "../validation/schemas";
import { recordAudit } from "./audit";
import { assertTenantWritable } from "./entitlements";
import { enforceRateLimit } from "./rate-limit";
import type { TenantActor } from "./types";

/*
 * Importación masiva de productos desde CSV (Excel → "Guardar como CSV").
 * Flujo: vista previa con errores por fila → confirmación. La confirmación vuelve a
 * validar TODO (no confía en la vista previa) y aplica todo o nada en una transacción.
 */

export const IMPORT_MAX_BYTES = 1_000_000;
export const IMPORT_MAX_ROWS = 5_000;
export const IMPORT_TEMPLATE =
  "sku;nombre;unidad;stock_minimo;maneja_lotes;requiere_vencimiento;codigo_barras\r\n" +
  "HARINA-1KG;Harina de maíz 1 kg;UND;24;no;no;7590000000011\r\n" +
  "LECHE-UHT-1L;Leche UHT 1 L;UND;12;si;si;\r\n" +
  "CABLE-12;Cable eléctrico N° 12;M;50;no;no;\r\n";

export type ImportMode = "crear" | "actualizar";
export type ImportStatus = "crear" | "actualizar" | "omitir" | "error";

export interface ImportRow {
  line: number;
  sku: string;
  name: string;
  unit: string;
  minStock: string | null;
  lotTracking: boolean;
  requiresExpiry: boolean;
  barcode: string | null;
  status: ImportStatus;
  errors: string[];
}

export interface ImportPreview {
  rows: ImportRow[];
  counts: Record<ImportStatus, number>;
  delimiter: string;
}

const HEADERS: Record<string, keyof Pick<ImportRow, "sku" | "name" | "unit" | "minStock" | "lotTracking" | "requiresExpiry" | "barcode">> = {
  sku: "sku",
  codigo: "sku",
  nombre: "name",
  name: "name",
  descripcion: "name",
  unidad: "unit",
  unit: "unit",
  stock_minimo: "minStock",
  minimo: "minStock",
  min_stock: "minStock",
  maneja_lotes: "lotTracking",
  lotes: "lotTracking",
  requiere_vencimiento: "requiresExpiry",
  vencimiento: "requiresExpiry",
  codigo_barras: "barcode",
  barcode: "barcode",
  ean: "barcode",
};

const UNIT_ALIASES: Record<string, string> = {
  UND: "UND", UNIDAD: "UND", UNIDADES: "UND", U: "UND", PZA: "UND",
  KG: "KG", KILO: "KG", KILOS: "KG", G: "G", GR: "G", GRAMO: "G", GRAMOS: "G",
  L: "L", LT: "L", LITRO: "L", LITROS: "L", ML: "ML",
  M: "M", MT: "M", METRO: "M", METROS: "M", CM: "CM",
};

const normHeader = (h: string) =>
  h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s.-]+/g, "_");

/** Analizador CSV con comillas ("a;b", ""escapadas"") y separador ; , o tabulador. */
export function parseCsv(text: string): { rows: string[][]; delimiter: string } {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", ",", "\t"].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1]);
  const delimiter = counts[0]![1] > 1 ? counts[0]![0] : ";";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return { rows, delimiter };
}

function parseBool(v: string | undefined): boolean | null {
  const s = (v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (s === "" || ["no", "n", "0", "false", "falso"].includes(s)) return false;
  if (["si", "s", "1", "true", "verdadero", "x"].includes(s)) return true;
  return null;
}

function analyze(text: string): { rows: ImportRow[]; delimiter: string } {
  if (new TextEncoder().encode(text).length > IMPORT_MAX_BYTES) throw validation("El archivo supera 1 MB.");
  const { rows: raw, delimiter } = parseCsv(text);
  if (raw.length < 2) throw validation("El archivo no tiene filas de productos (la primera fila debe ser el encabezado).");
  const header = raw[0]!.map((h) => HEADERS[normHeader(h)]);
  if (!header.includes("sku") || !header.includes("name")) {
    throw validation("El encabezado debe incluir al menos las columnas «sku» y «nombre». Descargue la plantilla.");
  }
  if (raw.length - 1 > IMPORT_MAX_ROWS) throw validation(`Máximo ${IMPORT_MAX_ROWS} productos por archivo.`);

  const seenSku = new Map<string, number>();
  const seenBarcode = new Map<string, number>();
  const rows = raw.slice(1).map((cells, i): ImportRow => {
    const get = (k: string) => {
      const idx = header.indexOf(k as never);
      return idx >= 0 ? (cells[idx] ?? "").trim() : "";
    };
    const errors: string[] = [];
    const unitRaw = get("unit").toUpperCase();
    const unit = unitRaw === "" ? "UND" : UNIT_ALIASES[unitRaw];
    if (!unit) errors.push(`Unidad «${get("unit")}» no válida (use UND, KG, G, L, ML, M o CM).`);
    const lot = parseBool(get("lotTracking"));
    const exp = parseBool(get("requiresExpiry"));
    if (lot === null) errors.push("«maneja_lotes» debe ser si o no.");
    if (exp === null) errors.push("«requiere_vencimiento» debe ser si o no.");
    const minIn = get("minStock");
    const minRaw = minIn.includes(",") ? minIn.replace(/\./g, "").replace(",", ".") : minIn;
    if (minRaw && !/^\d{1,12}(\.\d{1,3})?$/.test(minRaw)) errors.push("Stock mínimo inválido (número ≥ 0).");
    const barcode = get("barcode").replace(/\s+/g, "") || null;
    if (barcode && !/^[0-9A-Za-z-]{4,32}$/.test(barcode)) errors.push("Código de barras inválido (4 a 32 letras o números).");

    const parsed = createProductSchema.safeParse({ sku: get("sku"), name: get("name") });
    if (!parsed.success) errors.push(...parsed.error.issues.map((e) => e.message));
    const sku = parsed.success ? parsed.data.sku : get("sku").toUpperCase();
    const line = i + 2;
    if (sku) {
      const prev = seenSku.get(sku);
      if (prev) errors.push(`SKU repetido en el archivo (fila ${prev}).`);
      else seenSku.set(sku, line);
    }
    if (barcode) {
      const prev = seenBarcode.get(barcode);
      if (prev) errors.push(`Código de barras repetido en el archivo (fila ${prev}).`);
      else seenBarcode.set(barcode, line);
    }
    return {
      line,
      sku,
      name: parsed.success ? parsed.data.name : get("name"),
      unit: unit ?? unitRaw,
      minStock: minRaw || null,
      lotTracking: !!lot || !!exp,
      requiresExpiry: !!exp,
      barcode,
      status: errors.length ? "error" : "crear",
      errors,
    };
  });
  return { rows, delimiter };
}

async function classify(actor: TenantActor, text: string, mode: ImportMode): Promise<ImportPreview> {
  const { rows, delimiter } = analyze(text);
  const skus = rows.map((r) => r.sku).filter(Boolean);
  const barcodes = rows.map((r) => r.barcode).filter((b): b is string => !!b);
  const [existing, codes] = await withTenant(actor.tenantId, actor.userId, (tx) =>
    Promise.all([
      tx.product.findMany({ where: { tenantId: actor.tenantId, sku: { in: skus } }, select: { sku: true } }),
      tx.productBarcode.findMany({ where: { tenantId: actor.tenantId, code: { in: barcodes } }, select: { code: true, product: { select: { sku: true } } } }),
    ]),
  );
  const existingSkus = new Set(existing.map((p) => p.sku));
  for (const r of rows) {
    const code = r.barcode ? codes.find((c) => c.code === r.barcode) : undefined;
    if (code && code.product.sku !== r.sku) r.errors.push(`El código de barras ya pertenece al producto ${code.product.sku}.`);
    if (r.errors.length) {
      r.status = "error";
      continue;
    }
    r.status = existingSkus.has(r.sku) ? (mode === "actualizar" ? "actualizar" : "omitir") : "crear";
  }
  const counts = { crear: 0, actualizar: 0, omitir: 0, error: 0 };
  for (const r of rows) counts[r.status]++;
  return { rows, counts, delimiter };
}

export async function previewProductImport(actor: TenantActor, text: string, mode: ImportMode = "crear"): Promise<ImportPreview> {
  assertPermission(actor, "products.write");
  await enforceRateLimit(`product-import:${actor.tenantId}`, 60, 3600);
  return classify(actor, text, mode);
}

/** Aplica la importación: todo o nada. En «actualizar» solo cambia nombre y stock mínimo. */
export async function commitProductImport(actor: TenantActor, text: string, mode: ImportMode = "crear") {
  assertPermission(actor, "products.write");
  const preview = await classify(actor, text, mode);
  if (preview.counts.error > 0) throw validation(`Corrija las ${preview.counts.error} fila(s) con errores; no se importó nada.`);
  const toCreate = preview.rows.filter((r) => r.status === "crear");
  const toUpdate = preview.rows.filter((r) => r.status === "actualizar");
  if (!toCreate.length && !toUpdate.length) throw validation("No hay productos nuevos ni cambios que aplicar.");

  return withTenant(
    actor.tenantId,
    actor.userId,
    async (tx) => {
      await assertTenantWritable(tx, actor.tenantId);
      if (toCreate.length) {
        await tx.product.createMany({
          data: toCreate.map((r) => ({
            tenantId: actor.tenantId,
            sku: r.sku,
            name: r.name,
            baseUnit: r.unit as never,
            lotTracking: r.lotTracking,
            requiresExpiry: r.requiresExpiry,
            minStock: r.minStock ? new Prisma.Decimal(r.minStock) : null,
          })),
        });
      }
      for (const r of toUpdate) {
        await tx.product.update({
          where: { tenantId_sku: { tenantId: actor.tenantId, sku: r.sku } },
          data: { name: r.name, minStock: r.minStock ? new Prisma.Decimal(r.minStock) : null },
        });
      }
      const withCode = [...toCreate, ...toUpdate].filter((r) => r.barcode);
      if (withCode.length) {
        const ids = await tx.product.findMany({ where: { tenantId: actor.tenantId, sku: { in: withCode.map((r) => r.sku) } }, select: { id: true, sku: true } });
        await tx.productBarcode.createMany({
          data: withCode.map((r) => ({ tenantId: actor.tenantId, productId: ids.find((p) => p.sku === r.sku)!.id, code: r.barcode! })),
          skipDuplicates: true,
        });
      }
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "product.imported",
        entityType: "Product",
        entityId: null,
        metadata: {
          mode,
          created: toCreate.length,
          updated: toUpdate.length,
          skipped: preview.counts.omitir,
          skus: [...toCreate, ...toUpdate].slice(0, 200).map((r) => r.sku),
        },
        meta: actor.meta,
      });
      return { created: toCreate.length, updated: toUpdate.length, skipped: preview.counts.omitir };
    },
    { timeoutMs: 120_000 },
  );
}
