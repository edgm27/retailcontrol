"use client";

import { Alert, Badge, Button, Table, TBody, THead } from "@rc/ui";
import { startTransition, useActionState, useRef, useState } from "react";
import type { PreviewState } from "./actions";

const STATUS: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  crear: { label: "Nuevo", variant: "success" },
  actualizar: { label: "Actualizar", variant: "warning" },
  omitir: { label: "Ya existe (se omite)", variant: "secondary" },
  error: { label: "Error", variant: "destructive" },
};

/** Lee el archivo en UTF-8; si no lo es (CSV de Excel en Windows), usa Windows-1252. */
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

export function ImportPanel({ action }: { action: (s: PreviewState, fd: FormData) => Promise<PreviewState> }) {
  const [state, formAction, pending] = useActionState(action, { ok: false } as PreviewState);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState("crear");
  const [readError, setReadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function submit(intent: "preview" | "importar", csv = text, m = mode) {
    const fd = new FormData();
    fd.set("csv", csv);
    fd.set("mode", m);
    fd.set("intent", intent);
    startTransition(() => formAction(fd));
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setReadError(null);
    if (!f) return;
    if (f.size > 1_000_000) {
      setReadError("El archivo supera 1 MB. Divídalo en varios archivos.");
      return;
    }
    const t = await readText(f);
    setText(t);
    setFileName(f.name);
    submit("preview", t);
  }

  const preview = state.ok && state.data && !state.data.committed ? state.data : null;
  const ready = preview && preview.counts.error === 0 && preview.counts.crear + preview.counts.actualizar > 0;

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor="csv-file" className="text-sm font-medium">Archivo CSV</label>
          <input
            ref={fileRef}
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-navy file:px-4 file:py-2 file:text-white"
          />
          {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
        </div>
        <fieldset className="grid gap-1.5 text-sm">
          <legend className="mb-1 font-medium">Si el SKU ya existe</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" value="crear" checked={mode === "crear"} onChange={() => { setMode("crear"); if (text) submit("preview", text, "crear"); }} />
            Omitirlo (solo crear productos nuevos)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" value="actualizar" checked={mode === "actualizar"} onChange={() => { setMode("actualizar"); if (text) submit("preview", text, "actualizar"); }} />
            Actualizar nombre y stock mínimo
          </label>
        </fieldset>
      </div>

      {readError && <Alert variant="error">{readError}</Alert>}
      {state.error && <Alert variant="error">{state.error}</Alert>}
      {pending && <p className="text-sm text-muted-foreground" role="status">Procesando…</p>}
      {state.ok && state.data?.committed && <Alert variant="success">{state.message}</Alert>}

      {preview && (
        <>
          <ul className="flex flex-wrap gap-2 text-sm" data-testid="import-counts">
            <li className="rounded-xl border px-3 py-1.5">Nuevos: <strong>{preview.counts.crear}</strong></li>
            <li className="rounded-xl border px-3 py-1.5">A actualizar: <strong>{preview.counts.actualizar}</strong></li>
            <li className="rounded-xl border px-3 py-1.5">Omitidos: <strong>{preview.counts.omitir}</strong></li>
            <li className={`rounded-xl border px-3 py-1.5 ${preview.counts.error ? "border-destructive/50 bg-destructive/5" : ""}`}>Con errores: <strong>{preview.counts.error}</strong></li>
          </ul>
          {preview.counts.error > 0 && (
            <Alert variant="warning">Hay filas con errores. Corrija el archivo y vuelva a cargarlo: la importación es todo o nada.</Alert>
          )}
          <Table data-testid="import-preview">
            <THead><tr><th scope="col">Fila</th><th scope="col">SKU</th><th scope="col">Nombre</th><th scope="col">Unidad</th><th scope="col">Mínimo</th><th scope="col">Lotes / venc.</th><th scope="col">Estado</th></tr></THead>
            <TBody>
              {preview.rows.slice(0, 300).map((r) => (
                <tr key={r.line}>
                  <td className="tabular-nums">{r.line}</td>
                  <td className="font-mono text-xs">{r.sku}</td>
                  <td>{r.name}</td>
                  <td>{r.unit}</td>
                  <td className="tabular-nums">{r.minStock ?? "—"}</td>
                  <td>{r.lotTracking ? "Sí" : "No"} / {r.requiresExpiry ? "Sí" : "No"}</td>
                  <td>
                    <Badge variant={STATUS[r.status]!.variant}>{STATUS[r.status]!.label}</Badge>
                    {r.errors.map((e) => <div key={e} className="mt-1 text-xs text-destructive">{e}</div>)}
                  </td>
                </tr>
              ))}
            </TBody>
          </Table>
          {preview.rows.length > 300 && <p className="text-xs text-muted-foreground">Se muestran 300 de {preview.rows.length} filas.</p>}
          <div>
            <Button type="button" disabled={!ready || pending} onClick={() => submit("importar")}>
              {pending ? "Importando…" : `Importar ${preview.counts.crear + preview.counts.actualizar} producto(s)`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
