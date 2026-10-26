import { listPlansAdmin } from "@rc/domain";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@rc/ui";
import { ActionForm } from "@/components/action-form";
import { requirePlatform } from "@/server/session";
import { updatePlanAction } from "../actions";

export const metadata = { title: "Planes" };

export default async function PlatformPlans() {
  const { actor, user } = await requirePlatform();
  const plans = await listPlansAdmin(actor);
  const canManage = user.platformRole === "SUPERADMIN";
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold">Planes</h1>
        <p className="text-sm text-muted-foreground">Precio 0 = “A convenir” (no se contrata en línea). Límites vacíos = sin límite fijo (por contrato). Los cambios se ven en el landing y en Suscripción.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.code}>
            <CardHeader>
              <CardTitle className="text-base">{p.name} <span className="font-mono text-xs text-muted-foreground">{p.code}</span></CardTitle>
              <CardDescription>{p._count.subscriptions} empresa(s) en este plan</CardDescription>
            </CardHeader>
            <CardContent>
              {canManage ? (
                <ActionForm action={updatePlanAction} submitLabel="Guardar" variant="outline">
                  <input type="hidden" name="code" value={p.code} />
                  <Field label="Nombre" htmlFor={`n-${p.code}`}><Input id={`n-${p.code}`} name="name" defaultValue={p.name} required /></Field>
                  <Field label="Descripción" htmlFor={`d-${p.code}`}><Input id={`d-${p.code}`} name="description" defaultValue={p.description ?? ""} /></Field>
                  <Field label="Precio mensual (USD)" htmlFor={`p-${p.code}`}><Input id={`p-${p.code}`} name="priceMonthly" defaultValue={Number(p.priceMonthly).toFixed(2).replace(".", ",")} inputMode="decimal" required /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Máx. usuarios" htmlFor={`u-${p.code}`}><Input id={`u-${p.code}`} name="maxUsers" type="number" min={1} defaultValue={p.maxUsers ?? ""} /></Field>
                    <Field label="Máx. sucursales" htmlFor={`b-${p.code}`}><Input id={`b-${p.code}`} name="maxBranches" type="number" min={1} defaultValue={p.maxBranches ?? ""} /></Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p.active} className="size-4" /> Disponible para contratar</label>
                </ActionForm>
              ) : (
                <p className="text-sm">USD {Number(p.priceMonthly).toFixed(2)} · {p.maxUsers ?? "∞"} usuarios · {p.maxBranches ?? "∞"} sucursales</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
