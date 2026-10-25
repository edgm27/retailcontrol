import { beginTotpEnrollment, getMfaStatus } from "@rc/domain";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rc/ui";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { requireSession, toUserActor } from "@/server/session";
import { confirmEnrollmentAction } from "../actions";
import { EnrollmentPanel } from "./enrollment-panel";

export const metadata = { title: "Configurar verificación en dos pasos" };
export const dynamic = "force-dynamic";

export default async function ConfigureMfaPage({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const { motivo } = await searchParams;
  const s = await requireSession();
  const status = await getMfaStatus(s.userId);
  if (status.enrolled && !s.mfaVerified) redirect("/mfa/verificar");

  let enrollment: { qr: string; secret: string; grouped: string } | null = null;
  if (!status.enrolled) {
    const { secret, otpauthUrl } = await beginTotpEnrollment(await toUserActor(s));
    const qr = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220, errorCorrectionLevel: "M" });
    enrollment = { qr, secret, grouped: secret.match(/.{1,4}/g)?.join(" ") ?? secret };
  }

  return (
    <main id="contenido" className="mx-auto max-w-lg px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Verificación en dos pasos</CardTitle>
          <CardDescription>
            Escanee el código con Google Authenticator u otra app compatible (TOTP) y escriba el código que muestra.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {motivo && !status.enrolled && (
            <Alert variant="warning">
              {motivo === "plataforma"
                ? "Las cuentas de plataforma requieren verificación en dos pasos."
                : "Su rol requiere verificación en dos pasos para continuar."}
            </Alert>
          )}
          <EnrollmentPanel action={confirmEnrollmentAction} enrollment={enrollment} />
        </CardContent>
      </Card>
    </main>
  );
}
