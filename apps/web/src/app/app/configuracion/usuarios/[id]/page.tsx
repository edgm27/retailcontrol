import { canAssignRole, getMemberRow, isDomainError, ROLE_LABELS, TENANT_ROLES, type Role } from "@rc/domain";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Select } from "@rc/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { requireTenant } from "@/server/session";
import { removeUserAction, resetPasswordAction, setMfaAction, updateUserAction } from "../actions";
import { MfaBadge } from "../mfa-badge";
import { RemoveUserForm, ResetPasswordForm } from "../user-forms";

export const metadata = { title: "Editar usuario" };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, access } = await requireTenant("members.manage");
  const m = await getMemberRow(actor, id).catch((e) => {
    if (isDomainError(e)) notFound();
    throw e;
  });
  const editable = canAssignRole(access.role, m.role);
  const roles = TENANT_ROLES.filter((r) => canAssignRole(access.role, r)).map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  const mfaOn = m.mfaRequired || m.mfaEnrolled;

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <Link href="/app/configuracion/usuarios" className="text-sm text-primary hover:underline">← Usuarios</Link>
        <h1 className="mt-1 text-2xl font-bold">{m.name ?? m.email}</h1>
        <p className="text-sm text-muted-foreground">{m.email} · {ROLE_LABELS[m.role as Role]}</p>
      </div>
      {!editable && <Alert variant="warning">Solo un propietario puede modificar a otro propietario.</Alert>}
      {m.isSelf && <Alert variant="info">Este es su usuario. Su clave y su 2FA se administran desde <Link href="/cuenta/seguridad" className="underline">Seguridad</Link>.</Alert>}
      {!m.managed && !m.isSelf && (
        <Alert variant="info">
          Esta persona usa su propia cuenta de RetailControl (no fue creada por la empresa o pertenece a otra empresa):
          puede cambiar su rol, estado y exigirle 2FA, pero solo ella puede cambiar su clave o desvincular su app.
        </Alert>
      )}

      {editable && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Datos y rol</CardTitle></CardHeader>
            <CardContent>
              <ActionForm action={updateUserAction} submitLabel="Guardar cambios">
                <input type="hidden" name="membershipId" value={m.membershipId} />
                <div className="grid gap-4 sm:grid-cols-2">
                  {m.managed && (
                    <Field label="Nombre y apellido" htmlFor="eu-name">
                      <Input id="eu-name" name="name" defaultValue={m.name ?? ""} maxLength={120} />
                    </Field>
                  )}
                  <Field label="Correo (usuario)" htmlFor="eu-email" hint="El correo no se puede cambiar.">
                    <Input id="eu-email" value={m.email} disabled readOnly />
                  </Field>
                  <Field label="Rol" htmlFor="eu-role">
                    <Select id="eu-role" name="role" defaultValue={m.role} disabled={m.isSelf}>
                      {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="Estado" htmlFor="eu-status">
                    <Select id="eu-status" name="status" defaultValue={m.status} disabled={m.isSelf}>
                      <option value="ACTIVE">Activo</option>
                      <option value="DISABLED">Desactivado (no puede entrar a la empresa)</option>
                    </Select>
                  </Field>
                </div>
              </ActionForm>
            </CardContent>
          </Card>

          {!m.isSelf && (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">Verificación en dos pasos (Google Authenticator)</CardTitle>
                  <MfaBadge m={m} />
                </div>
                <CardDescription>
                  {m.mfaEnrolled
                    ? "El usuario ya vinculó su app: se le pide el código de 6 dígitos al entrar."
                    : mfaOn || m.mfaRequiredByPolicy
                      ? "En su próximo ingreso deberá vincular la app escaneando un código QR o tocando el enlace «Abrir en Google Authenticator» desde su teléfono."
                      : "Al activarla, en su próximo ingreso deberá vincular la app con un código QR o con un enlace."}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {m.mfaRequiredByPolicy && (
                  <Alert variant="info">La 2FA es obligatoria para este usuario por su rol o por la configuración de la empresa.</Alert>
                )}
                <ActionForm
                  action={setMfaAction}
                  submitLabel={mfaOn ? "Desactivar 2FA" : "Activar 2FA"}
                  variant={mfaOn ? "destructive" : "default"}
                  submitName="intent"
                  submitValue={mfaOn ? "desactivar" : "activar"}
                >
                  <input type="hidden" name="membershipId" value={m.membershipId} />
                  <input type="hidden" name="managed" value={m.managed ? "1" : "0"} />
                  {mfaOn && m.mfaEnrolled && m.managed && (
                    <p className="text-sm text-muted-foreground">Desactivar desvincula su app y borra sus códigos de recuperación; se cerrarán sus sesiones.</p>
                  )}
                </ActionForm>
              </CardContent>
            </Card>
          )}

          {m.managed && !m.isSelf && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Clave temporal</CardTitle>
                <CardDescription>Si olvidó su clave, asígnele una temporal. Deberá cambiarla al entrar y se cerrarán sus sesiones.</CardDescription>
              </CardHeader>
              <CardContent><ResetPasswordForm action={resetPasswordAction} membershipId={m.membershipId} email={m.email} /></CardContent>
            </Card>
          )}

          {!m.isSelf && (
            <Card className="border-destructive/30">
              <CardHeader><CardTitle className="text-base">Eliminar usuario</CardTitle></CardHeader>
              <CardContent><RemoveUserForm action={removeUserAction} membershipId={m.membershipId} managed={m.managed} /></CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
