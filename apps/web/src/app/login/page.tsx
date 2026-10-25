import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@rc/ui";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { googleEnabled } from "@/auth";
import { ActionForm } from "@/components/action-form";
import { getSession } from "@/server/session";
import { requestMagicLink, signInWithGoogle } from "./actions";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; registro?: string }> }) {
  const sp = await searchParams;
  if (await getSession()) redirect("/app");
  const next = sp.next ?? "/app";
  return (
    <main id="contenido" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>{sp.registro ? "Cree su cuenta" : "Entrar a RetailControl"}</CardTitle>
          <CardDescription>
            {sp.registro
              ? "Use su correo o su cuenta de Google. Después podrá registrar su empresa."
              : "Le enviaremos un enlace de acceso a su correo."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {googleEnabled && (
            <form action={signInWithGoogle}>
              <input type="hidden" name="next" value={next} />
              <Button type="submit" variant="outline" className="w-full">Continuar con Google</Button>
            </form>
          )}
          <ActionForm action={requestMagicLink} submitLabel="Enviar enlace de acceso" pendingLabel="Enviando…">
            <input type="hidden" name="next" value={next} />
            <Field label="Correo electrónico" htmlFor="email">
              <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
            </Field>
          </ActionForm>
          <p className="text-xs text-muted-foreground">
            Por seguridad, los propietarios y administradores deben activar la verificación en dos pasos con una app
            como Google Authenticator.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
