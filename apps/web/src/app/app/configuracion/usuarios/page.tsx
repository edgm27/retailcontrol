import { getTenantLimits, hasPermission, listMemberRows, listPendingInvitations, ROLE_LABELS, type Role } from "@rc/domain";
import { withTenant } from "@rc/db";
import { Alert, Badge, buttonVariants, Card, CardContent, CardHeader, CardTitle, EmptyState, Table, TBody, THead } from "@rc/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { MfaBadge } from "./mfa-badge";
import { requireTenant } from "@/server/session";
import { revokeInvitationAction } from "./actions";

export const metadata = { title: "Usuarios" };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ eliminado?: string }> }) {
  const sp = await searchParams;
  const { actor, access } = await requireTenant("members.read");
  const [members, invitations, limits] = await Promise.all([
    listMemberRows(actor),
    listPendingInvitations(actor),
    withTenant(actor.tenantId, actor.userId, (tx) => getTenantLimits(tx, actor.tenantId)),
  ]);
  const canManage = hasPermission(access.role, "members.manage");
  const used = members.filter((m) => m.status === "ACTIVE").length + invitations.length;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Usuarios</h1>
          <p className="text-sm text-muted-foreground">{used} de {limits?.maxUsers ?? "∞"} usuarios del plan</p>
        </div>
        {canManage && access.accessMode === "full" && (
          <Link href="/app/configuracion/usuarios/nuevo" className={buttonVariants()}>Nuevo usuario</Link>
        )}
      </div>
      {sp.eliminado && <Alert variant="success">Usuario eliminado de la empresa.</Alert>}
      {members.length === 0 ? (
        <EmptyState title="Sin usuarios" />
      ) : (
        <Table>
          <caption className="sr-only">Usuarios de la empresa</caption>
          <THead>
            <tr>
              <th scope="col">Usuario</th><th scope="col">Rol</th><th scope="col">Estado</th>
              <th scope="col">2FA (Google Authenticator)</th><th scope="col">Clave</th>{canManage && <th scope="col"><span className="sr-only">Acciones</span></th>}
            </tr>
          </THead>
          <TBody>
            {members.map((m) => (
              <tr key={m.membershipId}>
                <td>
                  <div className="font-medium">{m.name ?? m.email}{m.isSelf && <span className="ml-1 text-xs text-muted-foreground">(usted)</span>}</div>
                  <div className="text-xs text-muted-foreground">{m.email}</div>
                </td>
                <td>{ROLE_LABELS[m.role as Role]}</td>
                <td><Badge variant={m.status === "ACTIVE" ? "success" : "secondary"}>{m.status === "ACTIVE" ? "Activo" : "Desactivado"}</Badge></td>
                <td><MfaBadge m={m} /></td>
                <td>{m.mustChangePassword ? <Badge variant="warning">Temporal</Badge> : <span className="text-xs text-muted-foreground">Personal</span>}</td>
                {canManage && (
                  <td className="text-right">
                    <Link href={`/app/configuracion/usuarios/${m.membershipId}`} className="text-sm font-medium text-primary hover:underline" aria-label={`Editar ${m.email}`}>
                      Editar
                    </Link>
                  </td>
                )}
              </tr>
            ))}
          </TBody>
        </Table>
      )}
      {invitations.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Invitaciones anteriores pendientes</CardTitle></CardHeader>
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
    </div>
  );
}
