"use client";

import { Alert, Button, buttonVariants, Field, Input } from "@rc/ui";
import Link from "next/link";
import { useActionState } from "react";
import type { ClientFormState } from "@/components/action-form";
import { RecoveryCodesList } from "@/components/recovery-codes";

type Data = { recoveryCodes: string[] };

/**
 * El estado (códigos de recuperación) vive en este componente cliente, que se
 * mantiene montado aunque el servidor vuelva a renderizar la página tras la
 * acción: así los códigos no desaparecen antes de que el usuario los guarde.
 */
export function EnrollmentPanel({
  action,
  enrollment,
}: {
  action: (s: ClientFormState<Data>, fd: FormData) => Promise<ClientFormState<Data>>;
  enrollment: { qr: string; secret: string; grouped: string } | null;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false } as ClientFormState<Data>);

  if (state.ok && state.data) {
    return (
      <div className="grid gap-4">
        <Alert variant="success">Verificación en dos pasos activada.</Alert>
        <RecoveryCodesList codes={state.data.recoveryCodes} />
        <Link href="/app" className={buttonVariants({ variant: "secondary" })}>
          Ya guardé mis códigos, continuar
        </Link>
      </div>
    );
  }

  if (!enrollment) {
    return (
      <div className="grid gap-4">
        <Alert variant="success">La verificación en dos pasos ya está activa en su cuenta.</Alert>
        <Link href="/app" className={buttonVariants()}>Continuar</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={enrollment.qr}
        alt="Código QR para configurar la app de autenticación"
        width={220}
        height={220}
        className="mx-auto rounded border"
      />
      <div className="grid gap-1 text-sm">
        <span className="text-muted-foreground">¿No puede escanear? Escriba esta clave manualmente:</span>
        <code
          className="select-all break-all rounded bg-muted px-2 py-1 font-mono"
          data-testid="totp-secret"
          data-secret={enrollment.secret}
        >
          {enrollment.grouped}
        </code>
      </div>
      <form action={formAction} className="grid gap-4">
        <Field label="Código de 6 dígitos de su app" htmlFor="code">
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required />
        </Field>
        {state.error && <Alert variant="error">{state.error}</Alert>}
        <div>
          <Button type="submit" disabled={pending}>{pending ? "Verificando…" : "Activar verificación"}</Button>
        </div>
      </form>
    </div>
  );
}
