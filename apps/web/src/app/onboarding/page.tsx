import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@rc/ui";
import { ActionForm } from "@/components/action-form";
import { requireVerifiedUser } from "@/server/session";
import { createCompanyAction } from "./actions";

export const metadata = { title: "Registrar empresa" };

export default async function OnboardingPage() {
  await requireVerifiedUser();
  return (
    <main id="contenido" className="mx-auto max-w-lg px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Registre su empresa</CardTitle>
          <CardDescription>
            Comenzará con 14 días de prueba del plan Básico. Podrá cambiar de plan más adelante.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createCompanyAction} submitLabel="Crear empresa" pendingLabel="Creando…">
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
    </main>
  );
}
