"use client";

import { Field, Input, Select } from "@rc/ui";
import { useState } from "react";
import { ProductPicker, type PickerProduct } from "./product-picker";

const TYPES = [
  { value: "RECEIPT", label: "Entrada (recepción / compra)" },
  { value: "ISSUE", label: "Salida (despacho / venta / consumo)" },
  { value: "RETURN_IN", label: "Devolución de cliente (entra)" },
  { value: "RETURN_OUT", label: "Devolución a proveedor (sale)" },
];

export function MovementFields({ products }: { products: PickerProduct[] }) {
  const [type, setType] = useState("RECEIPT");
  const inbound = type === "RECEIPT" || type === "RETURN_IN";
  return (
    <>
      <Field label="Tipo de movimiento" htmlFor="mv-type">
        <Select id="mv-type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
      </Field>
      <ProductPicker products={products} lotMode={inbound ? "inbound" : "outbound"} key={inbound ? "in" : "out"} />
      {type === "RECEIPT" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Costo por unidad ingresada (opcional)" htmlFor="mv-cost" hint="En la moneda base de la empresa. Actualiza el costo promedio.">
            <Input id="mv-cost" name="unitCost" inputMode="decimal" />
          </Field>
        </div>
      )}
    </>
  );
}
