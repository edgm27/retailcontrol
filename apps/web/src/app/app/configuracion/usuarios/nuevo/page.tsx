import { canAssignRole, ROLE_LABELS, TENANT_ROLES } from "@rc/domain";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rc/ui";
import Link from "next/link";
import { requireTenant } from "@/server/session";
import { createUserAction } from "../actions";
import { NewUserForm } from "../user-forms";

export const metadata = { title: "Nuevo usuario" };

export default async function NewUserPage() {
  const { access } = await requireTenant("members.manage");
  const roles = TENANT_ROLES.filter((r) => canAssignRole(access.role, r)).map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <Link href="/app/configuracion/usuarios" className="text-sm text-primary hover:underline">← Usuarios</Link>
        <h1 className="mt-1 text-2xl font-bold">Nuevo usuario</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de acceso</CardTitle>
          <CardDescription>
            Cree el usuario con una clave temporal. Al entrar por primera vez deberá cambiarla por una personal.
          </CardDescription>
        </CardHeader>
        <CardContent><NewUserForm action={createUserAction} roles={roles} /></CardContent>
      </Card>
    </div>
  );
}
