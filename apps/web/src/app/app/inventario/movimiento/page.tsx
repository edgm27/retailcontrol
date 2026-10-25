import { listProductOptions, listWarehouses } from "@rc/domain";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Select } from "@rc/ui";
import { ActionForm } from "@/components/action-form";
import { MovementFields } from "@/components/inventory/movement-fields";
import { requireTenant } from "@/server/session";
import { postMovementAction } from "../actions";

export const metadata = { title: "Registrar movimiento" };

export default async function MovementPage() {
  const { actor } = await requireTenant("inventory.move");
  const [warehouses, products] = await Promise.all([listWarehouses(actor), listProductOptions(actor)]);
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Registrar entrada o salida</CardTitle>
        <CardDescription>
          Cada registro queda en el Kardex con su usuario y hora. Para corregir un error use “Revertir” en el Kardex.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={postMovementAction} submitLabel="Registrar" pendingLabel="Registrando…" idempotent>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Almacén" htmlFor="mv-wh">
              <Select id="mv-wh" name="warehouseId" required>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.branch.name})</option>)}
              </Select>
            </Field>
          </div>
          <MovementFields products={products} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Motivo o referencia (opcional)" htmlFor="mv-reason">
              <Input id="mv-reason" name="reason" maxLength={300} placeholder="Ej.: factura 0012345 del proveedor" />
            </Field>
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
