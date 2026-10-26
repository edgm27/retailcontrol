import { Card, CardDescription, CardHeader, CardTitle } from "@rc/ui";
import { AuthShell } from "@/components/shell/auth-shell";

export const metadata = { title: "Revise su correo" };

export default function VerifyRequestPage() {
  return (
    <AuthShell width="md" center>
      <Card>
        <CardHeader>
          <CardTitle>Revise su correo</CardTitle>
          <CardDescription>
            Le enviamos un enlace de acceso. Vence en 10 minutos y solo puede usarse una vez. Si no lo ve, revise la
            carpeta de spam.
          </CardDescription>
        </CardHeader>
      </Card>
    </AuthShell>
  );
}
