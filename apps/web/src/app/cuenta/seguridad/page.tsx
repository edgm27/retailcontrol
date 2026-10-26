import { getMfaStatus, isMfaMandatory, listUserSessions, PASSWORD_MIN_LENGTH, userHasPassword } from "@rc/domain";
import { Alert, Badge, buttonVariants, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@rc/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { requireVerifiedUser } from "@/server/session";
import {
  disableMfaAction,
  regenerateCodesAction,
  revokeAllAction,
  revokeOthersAction,
  revokeSessionAction,
  setPasswordAction,
} from "./actions";
import { RegenerateCodesForm } from "./regenerate-form";
import { AuthShell } from "@/components/shell/auth-shell";

export const metadata = { title: "Seguridad de la cuenta" };
export const dynamic = "force-dynamic";

function fmt(d: Date) {
  return d.toLocaleString("es-VE", { timeZone: "America/Caracas" });
}

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ recuperacion?: string }> }) {
  const sp = await searchParams;
  const user = await requireVerifiedUser();
  const [mfa, mandatory, sessions, hasPassword] = await Promise.all([
    getMfaStatus(user.userId),
    isMfaMandatory(user.userId),
    listUserSessions(user.userId),
    userHasPassword(user.userId),
  ]);

  return (
    <AuthShell width="3xl" panel>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Seguridad de la cuenta</h1>
        <Link href="/app" className={buttonVariants({ variant: "outline", size: "sm" })}>Volver</Link>
      </div>
      {sp.recuperacion && (
        <Alert variant="warning">
          Entró con un código de recuperación. Le quedan {mfa.recoveryCodesRemaining}. Si perdió su teléfono, genere
          nuevos códigos tras reconfigurar su app y cierre las demás sesiones.
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Verificación en dos pasos (TOTP)</CardTitle>
          <CardDescription>
            Estado:{" "}
            {mfa.enrolled ? <Badge variant="success">Activa</Badge> : <Badge variant="warning">Inactiva</Badge>}
            {mfa.enrolled && <> · {mfa.recoveryCodesRemaining} códigos de recuperación disponibles</>}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {!mfa.enrolled && (
            <>
              <p className="text-sm text-muted-foreground">
                Al activarla, además de su contraseña se pedirá un código de 6 dígitos de Google Authenticator (u otra
                app compatible) cada vez que inicie sesión.
              </p>
              <Link href="/mfa/configurar" className={buttonVariants()}>Activar verificación en dos pasos</Link>
            </>
          )}
          {mfa.enrolled && <RegenerateCodesForm action={regenerateCodesAction} />}
          {mfa.enrolled && !mandatory && (
            <ActionForm action={disableMfaAction} submitLabel="Desactivar verificación" variant="destructive">
              <Field label="Código actual para confirmar" htmlFor="disable-code">
                <Input id="disable-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
              </Field>
            </ActionForm>
          )}
          {mfa.enrolled && mandatory && (
            <p className="text-sm text-muted-foreground">Su rol exige la verificación en dos pasos; no puede desactivarse.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{hasPassword ? "Cambiar contraseña" : "Definir contraseña"}</CardTitle>
          <CardDescription>
            Mínimo {PASSWORD_MIN_LENGTH} caracteres. Al guardarla se cierran sus sesiones en otros dispositivos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={setPasswordAction} submitLabel="Guardar contraseña">
            {hasPassword && (
              <Field label="Contraseña actual" htmlFor="pw-current">
                <Input id="pw-current" name="current" type="password" autoComplete="current-password" required />
              </Field>
            )}
            <Field label="Nueva contraseña" htmlFor="pw-next">
              <Input id="pw-next" name="next" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
            </Field>
            <Field label="Confirmar nueva contraseña" htmlFor="pw-confirm">
              <Input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
            </Field>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sesiones activas</CardTitle>
          <CardDescription>Cierre las sesiones que no reconozca. El cierre es inmediato.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ul className="grid gap-3" data-testid="sessions">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <div>
                  <div className="font-medium">
                    {s.userAgent?.slice(0, 80) ?? "Dispositivo desconocido"}{" "}
                    {s.id === user.sessionId && <Badge variant="secondary">Esta sesión</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Inicio {fmt(s.createdAt)} · última actividad {fmt(s.lastSeenAt)}
                    {s.mfaVerifiedAt ? " · 2FA verificado" : ""}
                  </div>
                </div>
                <ActionForm action={revokeSessionAction} submitLabel="Cerrar" variant="outline">
                  <input type="hidden" name="sessionId" value={s.id} />
                </ActionForm>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <ActionForm action={revokeOthersAction} submitLabel="Cerrar las demás sesiones" variant="secondary" />
            <ActionForm action={revokeAllAction} submitLabel="Cerrar todas (incluida esta)" variant="destructive" />
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
