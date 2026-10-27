"use client";

import type { ScanProduct } from "@rc/domain";
import { Alert, Button, buttonVariants, Field, Input, Select } from "@rc/ui";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { BarcodeScanner } from "@/components/scanner/barcode-scanner";
import { UNIT_LABELS } from "@/lib/format";
import { lookupCodeAction, pickProductAction, searchProductsAction, submitScanReceiptAction } from "./actions";

type Currency = "USD" | "VES";

interface Line {
  key: string;
  productId: string;
  sku: string;
  name: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  lotNumber: string;
  expiresAt: string;
}

interface Draft {
  idempotencyKey: string;
  supplierId: string;
  warehouseId: string;
  currency: Currency;
  supplierInvoice: string;
  additionalCosts: string;
  lines: Line[];
}

interface Editing {
  product: ScanProduct;
  lineKey: string | null;
  unit: string;
  quantity: string;
  unitPrice: string;
  lotNumber: string;
  expiresAt: string;
}

const num = (v: string) => {
  const s = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const fmt = (n: number, d = 2) => n.toLocaleString("es-VE", { minimumFractionDigits: d, maximumFractionDigits: d });
const toInput = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100).replace(".", ",") : "");

function newDraft(supplierId: string, warehouseId: string, currency: Currency): Draft {
  return { idempotencyKey: crypto.randomUUID(), supplierId, warehouseId, currency, supplierInvoice: "", additionalCosts: "", lines: [] };
}

export function ReceiptScanner({
  tenantId,
  suppliers,
  warehouses,
  baseCurrency,
  rate,
  today,
  canSaveBarcodes,
}: {
  tenantId: string;
  suppliers: { id: string; name: string }[];
  warehouses: { id: string; name: string }[];
  baseCurrency: Currency;
  rate: number | null;
  today: string;
  canSaveBarcodes: boolean;
}) {
  const storageKey = `rc:recepcion-escaner:${tenantId}`;
  const [draft, setDraft] = useState<Draft>(() => newDraft(suppliers[0]?.id ?? "", warehouses[0]?.id ?? "", baseCurrency));
  const [loaded, setLoaded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);
  const [done, setDone] = useState<{ receiptId: string; number: number } | null>(null);
  const [pending, start] = useTransition();
  const qtyRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLElement>(null);

  // Borrador local: si se cierra la página, se cae la señal o se bloquea el teléfono, no se pierde lo escaneado.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const d = JSON.parse(raw) as Draft;
        if (d?.idempotencyKey && Array.isArray(d.lines)) setDraft(d);
      }
    } catch {
      /* sin almacenamiento local */
    }
    setLoaded(true);
  }, [storageKey]);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      /* sin almacenamiento local */
    }
  }, [draft, loaded, storageKey]);
  const editingKey = editing ? `${editing.product.productId}:${editing.lineKey ?? "nuevo"}` : null;
  useEffect(() => {
    if (!editingKey) return;
    editorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    qtyRef.current?.focus({ preventScroll: true });
    qtyRef.current?.select();
  }, [editingKey]);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  /** Costo sugerido por la unidad elegida y en la moneda del documento. */
  function suggestedPrice(p: ScanProduct, unit: string, currency: Currency): string {
    const base = Number(p.lastCost ?? p.avgCost);
    if (!base) return "";
    const factor = unit === p.baseUnit ? 1 : Number(p.units.find((u) => u.code === unit)?.factor ?? 1);
    let v = base * factor;
    if (currency !== baseCurrency) {
      if (!rate) return "";
      v = currency === "VES" ? v * rate : v / rate;
    }
    return toInput(v);
  }

  function openEditor(p: ScanProduct, existing?: Line) {
    setNotFound(null);
    setEditing({
      product: p,
      lineKey: existing?.key ?? null,
      unit: existing?.unit ?? p.scannedUnit,
      quantity: existing?.quantity ?? "1",
      unitPrice: existing?.unitPrice ?? suggestedPrice(p, p.scannedUnit, draft.currency),
      lotNumber: existing?.lotNumber ?? "",
      expiresAt: existing?.expiresAt ?? "",
    });
  }

  function lookup(raw: string) {
    const c = raw.trim();
    if (!c) return;
    setMessage(null);
    start(async () => {
      const r = await lookupCodeAction(c);
      if (!r.ok) return setMessage({ kind: "error", text: r.error });
      setCode("");
      if (r.data) openEditor(r.data);
      else {
        setEditing(null);
        setNotFound(c);
      }
    });
  }

  function saveLine(scanNext: boolean) {
    if (!editing) return;
    const p = editing.product;
    const q = num(editing.quantity);
    const price = num(editing.unitPrice || "0");
    if (!(q > 0)) return setMessage({ kind: "error", text: "La cantidad debe ser mayor que cero." });
    if (!(price >= 0)) return setMessage({ kind: "error", text: "Costo inválido." });
    if (p.lotTracking && !editing.lotNumber.trim()) return setMessage({ kind: "error", text: "Este producto maneja lotes: indique el lote." });
    if (p.requiresExpiry && !editing.expiresAt) return setMessage({ kind: "error", text: "Este producto requiere fecha de vencimiento." });
    if (editing.expiresAt && editing.expiresAt < today) return setMessage({ kind: "error", text: "No se puede recibir mercancía ya vencida." });
    setMessage(null);
    const line: Line = {
      key: editing.lineKey ?? crypto.randomUUID(),
      productId: p.productId,
      sku: p.sku,
      name: p.name,
      unit: editing.unit,
      quantity: editing.quantity.trim(),
      unitPrice: editing.unitPrice.trim() || "0",
      lotNumber: editing.lotNumber.trim().toUpperCase(),
      expiresAt: editing.expiresAt,
    };
    setDraft((d) => {
      if (editing.lineKey) return { ...d, lines: d.lines.map((l) => (l.key === editing.lineKey ? line : l)) };
      // Mismo producto, unidad, lote, vencimiento y costo: se suma a la línea existente.
      const same = d.lines.find(
        (l) => l.productId === line.productId && l.unit === line.unit && l.lotNumber === line.lotNumber && l.expiresAt === line.expiresAt && num(l.unitPrice) === num(line.unitPrice),
      );
      if (same) return { ...d, lines: d.lines.map((l) => (l.key === same.key ? { ...l, quantity: toInput(num(l.quantity) + q) } : l)) };
      return { ...d, lines: [line, ...d.lines] };
    });
    setEditing(null);
    setMessage({ kind: "success", text: `${p.name}: ${editing.quantity} ${editing.unit} agregado.` });
    if (scanNext) setScanning(true);
  }

  const total = useMemo(() => draft.lines.reduce((a, l) => a + (num(l.quantity) || 0) * (num(l.unitPrice) || 0), 0), [draft.lines]);
  const cur = draft.currency === "VES" ? "Bs." : "USD";

  function submit() {
    if (!draft.supplierId || !draft.warehouseId) return setMessage({ kind: "error", text: "Elija proveedor y almacén." });
    if (!draft.lines.length) return setMessage({ kind: "error", text: "Escanee al menos un producto." });
    setMessage(null);
    start(async () => {
      const r = await submitScanReceiptAction({
        idempotencyKey: draft.idempotencyKey,
        supplierId: draft.supplierId,
        warehouseId: draft.warehouseId,
        currency: draft.currency,
        supplierInvoice: draft.supplierInvoice,
        additionalCosts: draft.additionalCosts,
        lines: draft.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice, lotNumber: l.lotNumber, expiresAt: l.expiresAt })),
      });
      if (!r.ok) return setMessage({ kind: "error", text: r.error });
      setDone({ receiptId: r.data.receiptId, number: r.data.number });
      setDraft(newDraft(draft.supplierId, draft.warehouseId, draft.currency));
    });
  }

  if (done) {
    return (
      <div className="grid gap-4" data-testid="scan-receipt-done">
        <Alert variant="success">Recepción REC-{String(done.number).padStart(5, "0")} registrada. Las existencias ya se actualizaron.</Alert>
        <div className="flex flex-wrap gap-2">
          <Link href={`/app/recepciones/${done.receiptId}`} className={buttonVariants({ variant: "outline" })}>Ver recepción</Link>
          <Button type="button" onClick={() => setDone(null)}>Nueva recepción</Button>
        </div>
      </div>
    );
  }

  const units = editing ? [{ code: editing.product.baseUnit, name: UNIT_LABELS[editing.product.baseUnit] ?? editing.product.baseUnit, factor: "1" }, ...editing.product.units] : [];

  return (
    <div className="grid gap-4 pb-28">
      {/* 1. Datos de la recepción */}
      <details className="rounded-2xl border bg-card p-4">
        <summary className="cursor-pointer font-semibold">
          Datos de la recepción <span className="text-sm font-normal text-primary">(cambiar)</span>
          <span className="mt-1 block text-sm font-normal text-muted-foreground">
            {suppliers.find((s) => s.id === draft.supplierId)?.name ?? "Sin proveedor"} · {warehouses.find((w) => w.id === draft.warehouseId)?.name ?? "Sin almacén"} · {cur}
          </span>
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Proveedor" htmlFor="sr-sup">
            <Select id="sr-sup" value={draft.supplierId} onChange={(e) => update({ supplierId: e.target.value })}>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Almacén donde entra la mercancía" htmlFor="sr-wh">
            <Select id="sr-wh" value={draft.warehouseId} onChange={(e) => update({ warehouseId: e.target.value })}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </Field>
          <Field label="Moneda de los costos" htmlFor="sr-cur" hint={draft.currency !== baseCurrency ? (rate ? `Tasa del día: ${fmt(rate, 4)} Bs./USD (queda congelada en el documento).` : "No hay tasa registrada hoy: regístrela en Tasas antes de recibir.") : undefined}>
            <Select id="sr-cur" value={draft.currency} onChange={(e) => update({ currency: e.target.value as Currency })} disabled={draft.lines.length > 0}>
              <option value="USD">Dólares (USD)</option>
              <option value="VES">Bolívares (Bs.)</option>
            </Select>
          </Field>
          <Field label="Factura / nota de entrega (opcional)" htmlFor="sr-inv">
            <Input id="sr-inv" value={draft.supplierInvoice} maxLength={60} onChange={(e) => update({ supplierInvoice: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="Gastos adicionales (flete, etc.)" htmlFor="sr-add" hint="Se reparten entre los productos según su valor.">
            <Input id="sr-add" value={draft.additionalCosts} inputMode="decimal" onChange={(e) => update({ additionalCosts: e.target.value })} autoComplete="off" />
          </Field>
        </div>
      </details>

      {/* 2. Escanear */}
      {!editing && (
        <section className="grid gap-3 rounded-2xl border bg-card p-4" aria-label="Escanear producto">
          <Button type="button" size="lg" className="h-16 text-lg" onClick={() => { setMessage(null); setNotFound(null); setScanning(true); }}>
            Escanear código con la cámara
          </Button>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              lookup(code);
            }}
          >
            <label htmlFor="sr-code" className="sr-only">Código de barras o SKU</label>
            <Input id="sr-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="O escriba el código / SKU" inputMode="text" autoComplete="off" enterKeyHint="search" />
            <Button type="submit" variant="outline" disabled={pending || !code.trim()}>Buscar</Button>
          </form>
          <p className="text-xs text-muted-foreground">También funciona con un lector de códigos USB o Bluetooth: escanee aquí y se busca solo.</p>
        </section>
      )}

      {message && <Alert variant={message.kind}>{message.text}</Alert>}

      {notFound && (
        <NotFound
          code={notFound}
          canSave={canSaveBarcodes}
          onPicked={(p, warning) => {
            openEditor(p);
            setMessage(warning ? { kind: warning.startsWith("No se guardó") ? "info" : "success", text: warning } : null);
          }}
          onCancel={() => setNotFound(null)}
        />
      )}

      {/* 3. Captura de la línea */}
      {editing && (
        <section ref={editorRef} className="grid scroll-mt-20 gap-3 rounded-2xl border-2 border-brand-strong bg-card p-4" aria-label="Datos del producto recibido" data-testid="scan-line-editor">
          <div>
            <p className="font-mono text-xs text-muted-foreground">{editing.product.sku}</p>
            <h2 className="text-lg font-bold leading-tight">{editing.product.name}</h2>
            <p className="text-xs text-muted-foreground">
              {editing.product.lotTracking ? "Maneja lotes" : "Sin lotes"}
              {editing.product.requiresExpiry ? " · requiere vencimiento" : ""}
              {editing.product.lastCost ? ` · último costo ${baseCurrency} ${fmt(Number(editing.product.lastCost))}/${editing.product.baseUnit}` : ""}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cantidad" htmlFor="sr-qty">
              <div className="flex items-center gap-1">
                <button type="button" className="size-10 shrink-0 rounded-lg border text-lg" aria-label="Restar uno" onClick={() => setEditing({ ...editing, quantity: toInput(Math.max(0, num(editing.quantity) - 1)) })}>−</button>
                <Input ref={qtyRef} id="sr-qty" value={editing.quantity} onChange={(e) => setEditing({ ...editing, quantity: e.target.value })} inputMode="decimal" className="text-center text-lg font-semibold" autoComplete="off" />
                <button type="button" className="size-10 shrink-0 rounded-lg border text-lg" aria-label="Sumar uno" onClick={() => setEditing({ ...editing, quantity: toInput((num(editing.quantity) || 0) + 1) })}>+</button>
              </div>
            </Field>
            <Field label="Unidad" htmlFor="sr-unit">
              <Select
                id="sr-unit"
                value={editing.unit}
                onChange={(e) => setEditing({ ...editing, unit: e.target.value, unitPrice: suggestedPrice(editing.product, e.target.value, draft.currency) || editing.unitPrice })}
              >
                {units.map((u) => <option key={u.code} value={u.code}>{u.code === editing.product.baseUnit ? u.name : `${u.name} (${fmt(Number(u.factor), 0)} ${editing.product.baseUnit})`}</option>)}
              </Select>
            </Field>
            <Field label={`Costo por ${editing.unit} (${cur})`} htmlFor="sr-price">
              <Input id="sr-price" value={editing.unitPrice} onChange={(e) => setEditing({ ...editing, unitPrice: e.target.value })} inputMode="decimal" autoComplete="off" />
            </Field>
            <div className="grid content-end pb-2 text-sm text-muted-foreground">
              Subtotal: <strong className="text-foreground">{cur} {fmt((num(editing.quantity) || 0) * (num(editing.unitPrice) || 0))}</strong>
            </div>
            {(editing.product.lotTracking || editing.product.requiresExpiry) && (
              <>
                <Field label={`Lote${editing.product.lotTracking ? "" : " (opcional)"}`} htmlFor="sr-lot">
                  <Input
                    id="sr-lot"
                    value={editing.lotNumber}
                    list="sr-lots"
                    autoCapitalize="characters"
                    autoComplete="off"
                    onChange={(e) => {
                      const v = e.target.value;
                      const known = editing.product.lots.find((l) => l.lotNumber === v.toUpperCase());
                      setEditing({ ...editing, lotNumber: v, expiresAt: known?.expiresAt ?? editing.expiresAt });
                    }}
                  />
                  <datalist id="sr-lots">{editing.product.lots.map((l) => <option key={l.lotNumber} value={l.lotNumber}>{l.expiresAt ? `vence ${l.expiresAt}` : ""}</option>)}</datalist>
                </Field>
                <Field label={`Vencimiento${editing.product.requiresExpiry ? "" : " (opcional)"}`} htmlFor="sr-exp">
                  <Input id="sr-exp" type="date" className="min-w-0 appearance-none" min={today} value={editing.expiresAt} onChange={(e) => setEditing({ ...editing, expiresAt: e.target.value })} />
                </Field>
              </>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button type="button" onClick={() => saveLine(true)}>{editing.lineKey ? "Guardar y escanear" : "Agregar y escanear otro"}</Button>
            <Button type="button" variant="outline" onClick={() => saveLine(false)}>{editing.lineKey ? "Guardar cambios" : "Agregar"}</Button>
            <Button type="button" variant="ghost" onClick={() => { setEditing(null); setMessage(null); }}>Cancelar</Button>
          </div>
        </section>
      )}

      {/* 4. Lista de productos recibidos */}
      <section aria-labelledby="sr-list-t" className="grid gap-2">
        <h2 id="sr-list-t" className="flex items-center justify-between text-base font-semibold">
          Productos en esta recepción <span className="text-sm font-normal text-muted-foreground">{draft.lines.length}</span>
        </h2>
        {draft.lines.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aún no hay productos. Escanee el primero.</p>
        ) : (
          <ul className="grid gap-2" data-testid="scan-lines">
            {draft.lines.map((l) => (
              <li key={l.key} className="flex items-start justify-between gap-3 rounded-2xl border bg-card p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{l.sku}</span>
                    {l.lotNumber && ` · Lote ${l.lotNumber}`}
                    {l.expiresAt && ` · Vence ${l.expiresAt}`}
                  </p>
                  <p className="text-sm tabular-nums">{l.quantity} {l.unit} × {cur} {fmt(num(l.unitPrice) || 0)} = <strong>{cur} {fmt((num(l.quantity) || 0) * (num(l.unitPrice) || 0))}</strong></p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    className="rounded-full border px-3 py-1 text-xs"
                    onClick={() =>
                      start(async () => {
                        const r = await pickProductAction(l.productId, null, false);
                        if (r.ok && r.data.product) openEditor(r.data.product, l);
                      })
                    }
                  >
                    Editar
                  </button>
                  <button type="button" className="rounded-full border border-destructive/40 px-3 py-1 text-xs text-destructive" onClick={() => update({ lines: draft.lines.filter((x) => x.key !== l.key) })} aria-label={`Quitar ${l.name}`}>
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Barra inferior fija */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:left-[16.5rem]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="text-sm">
            <span className="text-muted-foreground">{draft.lines.length} producto(s)</span>
            <div className="text-lg font-bold tabular-nums">{cur} {fmt(total)}</div>
          </div>
          <div className="flex gap-2">
            {draft.lines.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { if (confirm("¿Descartar esta recepción?")) setDraft(newDraft(draft.supplierId, draft.warehouseId, draft.currency)); }}>
                Descartar
              </Button>
            )}
            <Button type="button" onClick={submit} disabled={pending || draft.lines.length === 0}>{pending ? "Registrando…" : "Registrar recepción"}</Button>
          </div>
        </div>
      </div>

      {scanning && (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onDetected={(c) => {
            setScanning(false);
            lookup(c);
          }}
        />
      )}
    </div>
  );
}

function NotFound({
  code,
  canSave,
  onPicked,
  onCancel,
}: {
  code: string;
  canSave: boolean;
  onPicked: (p: ScanProduct, warning: string | null) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; sku: string; name: string }[]>([]);
  const [save, setSave] = useState(canSave);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => {
      start(async () => {
        const r = await searchProductsAction(q);
        if (r.ok) setResults(r.data);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <section className="grid gap-3 rounded-2xl border-2 border-warning/50 bg-card p-4" aria-label="Código no registrado" data-testid="scan-not-found">
      <p className="text-sm">
        El código <strong className="font-mono">{code}</strong> no está registrado en su catálogo. Busque el producto para recibirlo:
      </p>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o SKU del producto" aria-label="Buscar producto" autoComplete="off" autoFocus />
      {canSave && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="size-4" />
          Guardar este código en el producto (la próxima vez se reconoce solo)
        </label>
      )}
      {error && <Alert variant="error">{error}</Alert>}
      <ul className="grid gap-1">
        {results.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              disabled={pending}
              className="w-full rounded-xl border px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() =>
                start(async () => {
                  const r = await pickProductAction(p.id, code, save);
                  if (!r.ok) return setError(r.error);
                  if (r.data.product) onPicked(r.data.product, r.data.warning ?? (save ? `Código ${code} guardado en ${r.data.product.name}.` : null));
                })
              }
            >
              <span className="font-mono text-xs text-muted-foreground">{p.sku}</span> {p.name}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Link href="/app/productos" className={buttonVariants({ variant: "outline", size: "sm" })}>Crear producto</Link>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
      </div>
    </section>
  );
}
