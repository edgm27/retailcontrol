import { getPaymentInstructions } from "@rc/domain";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rc/ui";
import { ActionForm } from "@/components/action-form";
import { requirePlatform } from "@/server/session";
import { paymentInstructionsAction } from "../actions";

export const metadata = { title: "Ajustes" };

export default async function PlatformSettings() {
  const { user } = await requirePlatform();
  const instructions = await getPaymentInstructions();
  return (
    <div className="grid max-w-3xl gap-5">
      <h1 className="text-2xl font-bold">Ajustes de la plataforma</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Instrucciones de pago</CardTitle>
          <CardDescription>
            Se muestran a las empresas en Suscripción. Incluya banco, titular, RIF, número de cuenta y datos de pago móvil.
            No incluya claves ni datos que no deban ser públicos para sus clientes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user.platformRole === "SUPERADMIN" ? (
            <ActionForm action={paymentInstructionsAction} submitLabel="Guardar instrucciones">
              <label htmlFor="instructions" className="sr-only">Instrucciones de pago</label>
              <textarea id="instructions" name="instructions" defaultValue={instructions} rows={8} minLength={10} maxLength={2000} required
                className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </ActionForm>
          ) : (
            <p className="whitespace-pre-line text-sm">{instructions}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
