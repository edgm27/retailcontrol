"use client";

import { Field, Input, Select } from "@rc/ui";
import { useMemo, useState } from "react";
import { UNIT_LABELS } from "@/lib/format";

export interface PickerProduct {
  id: string;
  sku: string;
  name: string;
  baseUnit: string;
  lotTracking: boolean;
  requiresExpiry: boolean;
  units: { code: string; factor: string }[];
}

const SAME_DIMENSION: Record<string, string[]> = {
  UND: ["UND"],
  KG: ["KG", "G"],
  G: ["G", "KG"],
  L: ["L", "ML"],
  ML: ["ML", "L"],
  M: ["M", "CM"],
  CM: ["CM", "M"],
};

/**
 * Selector de producto con autocompletado. Un lector de código de barras USB
 * escribe el código como teclado: si no está en la lista, el servidor lo
 * resuelve por código de barras al enviar.
 */
export function ProductPicker({
  products,
  showLot = "auto",
  lotMode = "inbound",
  idPrefix = "mv",
  withQuantity = true,
}: {
  products: PickerProduct[];
  showLot?: "auto" | "never";
  lotMode?: "inbound" | "outbound";
  idPrefix?: string;
  withQuantity?: boolean;
}) {
  const [code, setCode] = useState("");
  const bySku = useMemo(() => new Map(products.map((p) => [p.sku, p])), [products]);
  const selected = bySku.get(code.split(" — ")[0]!.trim().toUpperCase());
  const unitOptions = selected
    ? [...(SAME_DIMENSION[selected.baseUnit] ?? [selected.baseUnit]), ...selected.units.map((u) => u.code)]
    : [];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Producto (SKU, nombre o código de barras)" htmlFor={`${idPrefix}-product`}>
        <Input
          id={`${idPrefix}-product`}
          name="productCode"
          list={`${idPrefix}-products`}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          required
        />
        <datalist id={`${idPrefix}-products`}>
          {products.map((p) => (
            <option key={p.id} value={`${p.sku} — ${p.name}`} />
          ))}
        </datalist>
      </Field>
      {withQuantity && (
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <Field label="Cantidad" htmlFor={`${idPrefix}-qty`} hint="Use coma para decimales: 1,5">
          <Input id={`${idPrefix}-qty`} name="quantity" inputMode="decimal" required />
        </Field>
        <Field label="Unidad" htmlFor={`${idPrefix}-unit`}>
          {unitOptions.length ? (
            <Select id={`${idPrefix}-unit`} name="unit" defaultValue={selected?.baseUnit} key={selected?.id}>
              {unitOptions.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS[u] ?? u}
                  {selected?.units.find((x) => x.code === u) ? ` (${selected.units.find((x) => x.code === u)!.factor} ${selected.baseUnit})` : ""}
                </option>
              ))}
            </Select>
          ) : (
            <Input id={`${idPrefix}-unit`} name="unit" defaultValue="UND" required />
          )}
        </Field>
      </div>
      )}
      {showLot === "auto" && (!selected || selected.lotTracking) && (
        <>
          <Field
            label={lotMode === "inbound" ? "Número de lote" : "Lote (opcional)"}
            htmlFor={`${idPrefix}-lot`}
            hint={lotMode === "outbound" ? "Déjelo vacío para despachar por FEFO (vence primero, sale primero)." : undefined}
          >
            <Input id={`${idPrefix}-lot`} name="lotNumber" autoComplete="off" required={lotMode === "inbound" && !!selected?.lotTracking} />
          </Field>
          {lotMode === "inbound" && (
            <Field label="Fecha de vencimiento" htmlFor={`${idPrefix}-exp`}>
              <Input id={`${idPrefix}-exp`} name="expiresAt" type="date" required={!!selected?.requiresExpiry} />
            </Field>
          )}
        </>
      )}
    </div>
  );
}
