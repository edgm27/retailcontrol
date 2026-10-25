import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rc/ui";
import { ActionForm } from "@/components/action-form";
import { requireVerifiedUser } from "@/server/session";
import { acceptInvitationAction } from "./actions";

export const metadata = { title: "Aceptar invitación" };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await requireVerifiedUser();
  return (
    <main id="contenido" className="mx-auto max-w-md px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Invitación a una empresa</CardTitle>
          <CardDescription>
            Aceptará la invitación con la cuenta <strong>{user.email}</strong>. La invitación debe estar dirigida a
            este mismo correo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={acceptInvitationAction} submitLabel="Aceptar invitación">
            <input type="hidden" name="token" value={token} />
          </ActionForm>
        </CardContent>
      </Card>
    </main>
  );
}
