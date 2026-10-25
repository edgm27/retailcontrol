import { listUserTenants, ROLE_LABELS } from "@rc/domain";
import { Button, buttonVariants, Card, CardContent, CardHeader, CardTitle } from "@rc/ui";
import Link from "next/link";
import { requireVerifiedUser } from "@/server/session";
import { switchTenantAction } from "../app/actions";

export const metadata = { title: "Sus empresas" };

export default async function TenantsPage() {
  const user = await requireVerifiedUser();
  const tenants = await listUserTenants(user.userId);
  return (
    <main id="contenido" className="mx-auto max-w-lg px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Elija una empresa</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {tenants.map((t) => (
            <form key={t.tenantId} action={switchTenantAction} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-sm text-muted-foreground">{ROLE_LABELS[t.role]}</p>
              </div>
              <input type="hidden" name="tenantId" value={t.tenantId} />
              <Button type="submit" size="sm" variant={t.tenantId === user.activeTenantId ? "secondary" : "default"}>
                {t.tenantId === user.activeTenantId ? "Activa" : "Entrar"}
              </Button>
            </form>
          ))}
          <Link href="/onboarding" className={buttonVariants({ variant: "outline" })}>Registrar otra empresa</Link>
        </CardContent>
      </Card>
    </main>
  );
}
