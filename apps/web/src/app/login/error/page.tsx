import { buttonVariants, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rc/ui";
import Link from "next/link";
import { AuthShell } from "@/components/shell/auth-shell";

export const metadata = { title: "No se pudo entrar" };

const MESSAGES: Record<string, string> = {
  Verification: "El enlace ya se usó o venció. Solicite uno nuevo.",
  AccessDenied: "No fue posible autorizar el acceso con esa cuenta.",
  OAuthAccountNotLinked: "Ese correo ya está asociado a otro método de acceso.",
};

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AuthShell width="md" center>
      <Card>
        <CardHeader>
          <CardTitle>No se pudo entrar</CardTitle>
          <CardDescription>{(error && MESSAGES[error]) ?? "Ocurrió un problema al iniciar sesión."}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className={buttonVariants()}>Volver a intentar</Link>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
