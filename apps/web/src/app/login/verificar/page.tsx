import { Card, CardDescription, CardHeader, CardTitle } from "@rc/ui";

export const metadata = { title: "Revise su correo" };

export default function VerifyRequestPage() {
  return (
    <main id="contenido" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <Card>
        <CardHeader>
          <CardTitle>Revise su correo</CardTitle>
          <CardDescription>
            Le enviamos un enlace de acceso. Vence en 10 minutos y solo puede usarse una vez. Si no lo ve, revise la
            carpeta de spam.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
