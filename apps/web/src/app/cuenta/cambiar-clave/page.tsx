import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@rc/ui";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { AuthShell } from "@/components/shell/auth-shell";
import { requireVerifiedUser } from "@/server/session";
import { changeTemporaryPasswordAction } from "./actions";

export const metadata = { title: "Cambiar clave temporal" };

export default async function ChangeTemporaryPasswordPage() {
  const u = await requireVerifiedUser({ allowPendingPasswordChange: true });
  if (!u.mustChangePassword) redirect("/app");
  return (
    <AuthShell width="md" center>
      <Card>
        <CardHeader>
          <CardTitle>Cree su contraseña</CardTitle>
          <CardDescription>
            Entró con una clave temporal asignada por el administrador. Para continuar, defina una contraseña personal.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Alert variant="info">Mínimo 12 caracteres. Use una frase fácil de recordar y difícil de adivinar. No la comparta.</Alert>
          <ActionForm action={changeTemporaryPasswordAction} submitLabel="Guardar y continuar" pendingLabel="Guardando…">
            <input type="hidden" name="username" value={u.email} autoComplete="username" readOnly />
            <Field label="Clave temporal" htmlFor="current">
              <Input id="current" name="current" type="password" autoComplete="current-password" required />
            </Field>
            <Field label="Nueva contraseña" htmlFor="next">
              <Input id="next" name="next" type="password" autoComplete="new-password" minLength={12} required />
            </Field>
            <Field label="Repita la nueva contraseña" htmlFor="confirm">
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
            </Field>
          </ActionForm>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
