import { hasPermission, listBranches } from "@rc/domain";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Select } from "@rc/ui";
import { ActionForm } from "@/components/action-form";
import { requireTenant } from "@/server/session";
import { createBranchAction, createWarehouseAction } from "./actions";

export const metadata = { title: "Sucursales y almacenes" };

export default async function BranchesPage() {
  const { actor, access } = await requireTenant("branches.read");
  const branches = await listBranches(actor);
  const canManage = hasPermission(access.role, "branches.manage") && access.accessMode === "full";

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">Sucursales y almacenes</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {branches.map((b) => (
          <Card key={b.id}>
            <CardHeader>
              <CardTitle className="text-base">{b.name} <span className="font-mono text-sm text-muted-foreground">({b.code})</span></CardTitle>
              {b.address && <CardDescription>{b.address}</CardDescription>}
            </CardHeader>
            <CardContent>
              <ul className="grid gap-1 text-sm">
                {b.warehouses.map((w) => (
                  <li key={w.id} className="flex items-center justify-between">
                    <span>{w.name} <span className="font-mono text-muted-foreground">({w.code})</span></span>
                    {!w.active && <Badge variant="secondary">Inactivo</Badge>}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
      {canManage && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Nueva sucursal</CardTitle><CardDescription>El límite depende de su plan.</CardDescription></CardHeader>
            <CardContent>
              <ActionForm action={createBranchAction} submitLabel="Crear sucursal">
                <Field label="Código" htmlFor="b-code"><Input id="b-code" name="code" required maxLength={32} /></Field>
                <Field label="Nombre" htmlFor="b-name"><Input id="b-name" name="name" required maxLength={120} /></Field>
                <Field label="Dirección (opcional)" htmlFor="b-address"><Input id="b-address" name="address" maxLength={300} /></Field>
              </ActionForm>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Nuevo almacén</CardTitle></CardHeader>
            <CardContent>
              <ActionForm action={createWarehouseAction} submitLabel="Crear almacén">
                <Field label="Sucursal" htmlFor="w-branch">
                  <Select id="w-branch" name="branchId" required>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </Field>
                <Field label="Código" htmlFor="w-code"><Input id="w-code" name="code" required maxLength={32} /></Field>
                <Field label="Nombre" htmlFor="w-name"><Input id="w-name" name="name" required maxLength={120} /></Field>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
