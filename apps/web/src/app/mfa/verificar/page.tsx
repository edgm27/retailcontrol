import { getMfaStatus } from "@rc/domain";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@rc/ui";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { requireSession } from "@/server/session";
import { verifyRecoveryAction, verifyTotpAction } from "../actions";
import { AuthShell } from "@/components/shell/auth-shell";

export const metadata = { title: "Verificación en dos pasos" };
export const dynamic = "force-dynamic";

export default async function VerifyMfaPage() {
  const s = await requireSession();
  const status = await getMfaStatus(s.userId);
  if (!status.enrolled) redirect("/mfa/configurar");
  if (s.mfaVerified) redirect("/app");

  return (
    <AuthShell width="md">
      <Card>
        <CardHeader>
          <CardTitle>Verificación en dos pasos</CardTitle>
          <CardDescription>Escriba el código de 6 dígitos de su app de autenticación.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-8">
          <ActionForm action={verifyTotpAction} submitLabel="Verificar">
            <Field label="Código" htmlFor="code">
              <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus />
            </Field>
          </ActionForm>
          <details className="rounded-md border p-4">
            <summary className="cursor-pointer text-sm font-medium">¿Perdió su teléfono? Use un código de recuperación</summary>
            <div className="mt-4">
              <ActionForm action={verifyRecoveryAction} submitLabel="Usar código de recuperación" variant="outline">
                <Field label="Código de recuperación" htmlFor="recoveryCode" hint="Formato XXXXX-XXXXX. Cada código sirve una sola vez.">
                  <Input id="recoveryCode" name="recoveryCode" autoComplete="off" autoCapitalize="characters" required />
                </Field>
              </ActionForm>
              <p className="mt-3 text-xs text-muted-foreground">
                Si tampoco tiene sus códigos, contacte a soporte: verificaremos su identidad antes de restablecer el
                acceso.
              </p>
            </div>
          </details>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
