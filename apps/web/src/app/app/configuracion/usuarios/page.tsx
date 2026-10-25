import {
  canAssignRole,
  getTenantLimits,
  hasPermission,
  listMembers,
  listPendingInvitations,
  ROLE_LABELS,
  TENANT_ROLES,
  type Role,
} from "@rc/domain";
import { withTenant } from "@rc/db";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Select, Table, TBody, THead } from "@rc/ui";
import { ActionForm } from "@/components/action-form";
import { requireTenant } from "@/server/session";
import { changeRoleAction, inviteAction, revokeInvitationAction, toggleMemberAction } from "./actions";
import { InviteForm } from "./invite-form";

export const metadata = { title: "Usuarios" };

export default async function MembersPage() {
  const { actor, access } = await requireTenant("members.read");
  const [members, invitations, limits] = await Promise.all([
    listMembers(actor),
    listPendingInvitations(actor),
    withTenant(actor.tenantId, actor.userId, (tx) => getTenantLimits(tx, actor.tenantId)),
  ]);
  const canManage = hasPermission(access.role, "members.manage");
  const assignable = TENANT_ROLES.filter((r) => canAssignRole(access.role, r)).map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  const used = members.filter((m) => m.status === "ACTIVE").length + invitations.length;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          {used} de {limits?.maxUsers ?? "∞"} usuarios del plan (incluye invitaciones pendientes)
        </p>
      </div>
      <Table>
        <caption className="sr-only">Miembros de la empresa</caption>
        <THead><tr><th scope="col">Usuario</th><th scope="col">Rol</th><th scope="col">Estado</th>{canManage && <th scope="col">Acciones</th>}</tr></THead>
        <TBody>
          {members.map((m) => {
            const editable = canManage && canAssignRole(access.role, m.role as Role);
            return (
              <tr key={m.id}>
                <td><div className="font-medium">{m.user.name ?? m.user.email}</div><div className="text-xs text-muted-foreground">{m.user.email}</div></td>
                <td>{ROLE_LABELS[m.role as Role]}</td>
                <td><Badge variant={m.status === "ACTIVE" ? "success" : "secondary"}>{m.status === "ACTIVE" ? "Activo" : "Desactivado"}</Badge></td>
                {canManage && (
                  <td>
                    {editable ? (
                      <div className="flex flex-wrap gap-2">
                        <ActionForm action={changeRoleAction} submitLabel="Cambiar rol" variant="outline" className="flex flex-row items-end gap-2">
                          <input type="hidden" name="membershipId" value={m.id} />
                          <label className="sr-only" htmlFor={`role-${m.id}`}>Rol</label>
                          <Select id={`role-${m.id}`} name="role" defaultValue={m.role} className="w-40">
                            {assignable.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </Select>
                        </ActionForm>
                        <ActionForm action={toggleMemberAction} submitLabel={m.status === "ACTIVE" ? "Desactivar" : "Reactivar"} variant={m.status === "ACTIVE" ? "destructive" : "secondary"}>
                          <input type="hidden" name="membershipId" value={m.id} />
                          <input type="hidden" name="status" value={m.status === "ACTIVE" ? "DISABLED" : "ACTIVE"} />
                        </ActionForm>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">Sin acciones</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </TBody>
      </Table>
      {invitations.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Invitaciones pendientes</CardTitle></CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{i.email} · {ROLE_LABELS[i.role as Role]} · vence {i.expiresAt.toLocaleString("es-VE", { timeZone: "America/Caracas" })}</span>
                  {canManage && (
                    <ActionForm action={revokeInvitationAction} submitLabel="Revocar" variant="outline">
                      <input type="hidden" name="invitationId" value={i.id} />
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {canManage && access.accessMode === "full" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invitar usuario</CardTitle>
            <CardDescription>La persona debe entrar con el mismo correo al que se envía la invitación.</CardDescription>
          </CardHeader>
          <CardContent><InviteForm action={inviteAction} roles={assignable} /></CardContent>
        </Card>
      )}
    </div>
  );
}
