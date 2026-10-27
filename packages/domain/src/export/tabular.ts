import { strToU8, zipSync } from "fflate";
import type { ReportColumn, ReportResult, ReportRow } from "../services/reports";

/*
 * Exportación de reportes a CSV y XLSX sin dependencias pesadas.
 * - Protección contra inyección de fórmulas (CSV/Excel): un texto que empieza con = + - @ (o tab/CR)
 *   se antepone con apóstrofo para que la hoja de cálculo lo trate como texto.
 * - CSV para Excel en español: UTF-8 con BOM, separador ";" y coma decimal.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

export function neutralizeFormula(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

function csvNumber(v: number, type: ReportColumn["type"]): string {
  // Sin separador de miles (Excel lo interpreta mal en algunos equipos) y con coma decimal.
  const fixed = type === "int" ? v.toFixed(0) : type === "money" || type === "percent" ? v.toFixed(2) : String(Number(v.toFixed(3)));
  return fixed.replace(".", ",");
}

function csvCell(value: string | number | null, col: ReportColumn): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (typeof value === "number" && col.type !== "text") s = csvNumber(value, col.type);
  else s = neutralizeFormula(String(value));
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(report: Pick<ReportResult, "columns" | "rows">): Uint8Array {
  const lines = [report.columns.map((c) => csvCell(c.label, { ...c, type: "text" })).join(";")];
  for (const row of report.rows) lines.push(report.columns.map((c) => csvCell(row[c.key] ?? null, c)).join(";"));
  return strToU8(`\uFEFF${lines.join("\r\n")}\r\n`);
}

// ─────────────────────────────── XLSX (SpreadsheetML mínimo) ───────────────────────────────

const xmlEscape = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex -- quita caracteres de control no válidos en XML
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Estilos: 0 normal · 1 encabezado (negrita) · 2 número 0.000 · 3 moneda 0.00 · 4 entero · 5 porcentaje 0.00 · 6 fecha
const STYLE: Record<ReportColumn["type"], number> = { text: 0, number: 2, money: 3, int: 4, percent: 5, date: 6 };

function excelDate(iso: string): number | null {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(t) ? null : t / 86_400_000 + 25569;
}

function cell(ref: string, value: string | number | null, col: ReportColumn | null, header = false): string {
  if (value === null || value === undefined || value === "") return "";
  if (header) return `<c r="${ref}" t="inlineStr" s="1"><is><t>${xmlEscape(String(value))}</t></is></c>`;
  const type = col?.type ?? "text";
  if (type === "date" && typeof value === "string") {
    const d = excelDate(value);
    if (d !== null) return `<c r="${ref}" s="6"><v>${d}</v></c>`;
  }
  if (typeof value === "number" && type !== "text" && Number.isFinite(value)) {
    const v = type === "percent" ? value / 100 : value;
    return `<c r="${ref}" s="${STYLE[type]}"><v>${v}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(neutralizeFormula(String(value)))}</t></is></c>`;
}

export function toXlsx(report: Pick<ReportResult, "title" | "columns" | "rows">, meta: { subtitle?: string } = {}): Uint8Array {
  const cols = report.columns;
  const out: string[] = [];
  let r = 1;
  // Título y subtítulo arriba de la tabla.
  out.push(`<row r="${r}">${cell(`A${r}`, report.title, null, true)}</row>`);
  r++;
  if (meta.subtitle) {
    out.push(`<row r="${r}">${cell(`A${r}`, meta.subtitle, null)}</row>`);
    r++;
  }
  r++;
  const headerRow = r;
  out.push(`<row r="${r}">${cols.map((c, i) => cell(`${colName(i)}${r}`, c.label, null, true)).join("")}</row>`);
  for (const row of report.rows as ReportRow[]) {
    r++;
    out.push(`<row r="${r}">${cols.map((c, i) => cell(`${colName(i)}${r}`, row[c.key] ?? null, c)).join("")}</row>`);
  }
  const widths = cols.map((c, i) => {
    const longest = Math.max(c.label.length, ...report.rows.slice(0, 200).map((row) => String(row[c.key] ?? "").length));
    return `<col min="${i + 1}" max="${i + 1}" width="${Math.min(Math.max(longest + 2, 8), 60)}" customWidth="1"/>`;
  });
  const lastCol = colName(Math.max(cols.length - 1, 0));
  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${widths.join("")}</cols><sheetData>${out.join("")}</sheetData>` +
    (report.rows.length ? `<autoFilter ref="A${headerRow}:${lastCol}${r}"/>` : "") +
    `</worksheet>`;

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="${xmlEscape(report.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.000"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/></numFmts>` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
        `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="7">` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
        `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
        `<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
        `<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
        `<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
        `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
        `</cellXfs></styleSheet>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  };
  return zipSync(files, { level: 6 });
}
