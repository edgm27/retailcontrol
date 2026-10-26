import { hasPermission, listSuppliers } from "@rc/domain";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Field, Input, Table, TBody, THead } from "@rc/ui";
import { ActionForm } from "@/components/action-form";
import { requireTenant } from "@/server/session";
import { createSupplierAction, updateSupplierAction } from "../compras/actions";

export const metadata = { title: "Proveedores" };

type S = Awaited<ReturnType<typeof listSuppliers>>[number];

function SupplierFields({ s, prefix }: { s?: S; prefix: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nombre comercial" htmlFor={`${prefix}-name`}><Input id={`${prefix}-name`} name="name" required minLength={2} defaultValue={s?.name} /></Field>
      <Field label="Razón social" htmlFor={`${prefix}-legal`}><Input id={`${prefix}-legal`} name="legalName" defaultValue={s?.legalName ?? ""} /></Field>
      <Field label="RIF" htmlFor={`${prefix}-rif`} hint="Formato J-12345678-9. Solo se valida el formato."><Input id={`${prefix}-rif`} name="rif" defaultValue={s?.rif ?? ""} /></Field>
      <Field label="Persona de contacto" htmlFor={`${prefix}-contact`}><Input id={`${prefix}-contact`} name="contactName" defaultValue={s?.contactName ?? ""} /></Field>
      <Field label="Correo" htmlFor={`${prefix}-email`}><Input id={`${prefix}-email`} name="email" type="email" defaultValue={s?.email ?? ""} /></Field>
      <Field label="Teléfono" htmlFor={`${prefix}-phone`}><Input id={`${prefix}-phone`} name="phone" defaultValue={s?.phone ?? ""} /></Field>
      <Field label="Dirección" htmlFor={`${prefix}-addr`}><Input id={`${prefix}-addr`} name="address" defaultValue={s?.address ?? ""} /></Field>
      <Field label="Crédito (días)" htmlFor={`${prefix}-terms`}><Input id={`${prefix}-terms`} name="paymentTermsDays" inputMode="numeric" defaultValue={s?.paymentTermsDays ?? ""} /></Field>
    </div>
  );
}

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const { actor, access } = await requireTenant("suppliers.read");
  const canWrite = hasPermission(access.role, "suppliers.write") && access.accessMode === "full";
  const suppliers = await listSuppliers(actor, { search: sp.q, includeInactive: true });
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">Proveedores</h1>
      <form role="search" action="/app/proveedores">
        <label htmlFor="q" className="sr-only">Buscar</label>
        <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por nombre o RIF" className="max-w-md" />
      </form>
      {suppliers.length === 0 ? (
        <EmptyState title="Sin proveedores" />
      ) : (
        <Table>
          <THead><tr><th scope="col">Proveedor</th><th scope="col">RIF</th><th scope="col">Contacto</th><th scope="col">Crédito</th>{canWrite && <th scope="col"><span className="sr-only">Editar</span></th>}</tr></THead>
          <TBody>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td>{s.name} {!s.active && <Badge variant="secondary">Inactivo</Badge>}<div className="text-xs text-muted-foreground">{s.legalName}</div></td>
                <td className="font-mono text-xs">{s.rif ?? "—"}</td>
                <td className="text-sm">{s.contactName}<div className="text-xs text-muted-foreground">{[s.phone, s.email].filter(Boolean).join(" · ")}</div></td>
                <td>{s.paymentTermsDays != null ? `${s.paymentTermsDays} días` : "Contado"}</td>
                {canWrite && (
                  <td>
                    <details>
                      <summary className="cursor-pointer text-sm text-primary">Editar</summary>
                      <ActionForm action={updateSupplierAction} submitLabel="Guardar" className="mt-3 w-[min(80vw,40rem)]">
                        <input type="hidden" name="supplierId" value={s.id} />
                        <SupplierFields s={s} prefix={`e-${s.id}`} />
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={s.active} className="h-4 w-4" /> Activo</label>
                      </ActionForm>
                    </details>
                  </td>
                )}
              </tr>
            ))}
          </TBody>
        </Table>
      )}
      {canWrite && (
        <Card className="max-w-3xl">
          <CardHeader><CardTitle className="text-base">Nuevo proveedor</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={createSupplierAction} submitLabel="Crear proveedor"><SupplierFields prefix="n" /></ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
