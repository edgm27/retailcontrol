import { listPublicPlans } from "@rc/domain";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@rc/ui";
import { ActionForm } from "@/components/action-form";
import { requireVerifiedUser } from "@/server/session";
import { createCompanyAction } from "./actions";
import { AuthShell } from "@/components/shell/auth-shell";

export const metadata = { title: "Registrar empresa" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  await requireVerifiedUser();
  const sp = await searchParams;
  const plans = (await listPublicPlans()).filter((p) => Number(p.priceMonthly) > 0);
  const preselected = plans.some((p) => p.code === sp.plan) ? sp.plan! : (plans.find((p) => p.code === "PROFESIONAL") ?? plans[0])?.code;
  return (
    <AuthShell width="lg">
      <Card>
        <CardHeader>
          <CardTitle>Registre su empresa</CardTitle>
          <CardDescription>
            Elija un plan y pruébelo gratis durante 14 días, sin tarjeta. Podrá cambiar de plan al pagar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createCompanyAction} submitLabel="Crear empresa y comenzar la prueba" pendingLabel="Creando…">
            <fieldset className="grid gap-3">
              <legend className="mb-2 text-sm font-medium">Plan</legend>
              {plans.map((p) => (
                <label key={p.code} className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 has-[:checked]:border-brand-strong has-[:checked]:bg-accent/60">
                  <input type="radio" name="plan" value={p.code} defaultChecked={p.code === preselected} className="mt-1 size-4 accent-[var(--color-primary)]" required />
                  <span className="flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-sm font-semibold tabular-nums">USD {Number(p.priceMonthly).toLocaleString("es-VE", { minimumFractionDigits: 2 })}/mes</span>
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {p.description} {p.maxBranches ? `Hasta ${p.maxBranches} sucursal(es)` : ""}{p.maxUsers ? ` y ${p.maxUsers} usuarios.` : ""}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Field label="Nombre comercial" htmlFor="name">
              <Input id="name" name="name" required minLength={2} maxLength={120} autoComplete="organization" />
            </Field>
            <Field label="Razón social (opcional)" htmlFor="legalName">
              <Input id="legalName" name="legalName" maxLength={200} />
            </Field>
            <Field label="RIF (opcional)" htmlFor="rif" hint="Ejemplo de formato: J-12345678-9. Solo validamos el formato.">
              <Input id="rif" name="rif" maxLength={14} autoCapitalize="characters" />
            </Field>
          </ActionForm>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
