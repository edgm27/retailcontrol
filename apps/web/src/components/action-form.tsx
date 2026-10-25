"use client";

import { Alert, Button, cn } from "@rc/ui";
import { Fragment, startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

export interface ClientFormState<T = unknown> {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  data?: T;
}

type Action<T> = (state: ClientFormState<T>, formData: FormData) => Promise<ClientFormState<T>>;

/**
 * Formulario accesible con estado de envío, mensajes de error y éxito
 * anunciados a lectores de pantalla. La acción es un Server Action.
 */
export function ActionForm<T>({
  action,
  submitLabel,
  pendingLabel = "Procesando…",
  children,
  className,
  variant,
  renderResult,
  idempotent = false,
  submitName,
  submitValue,
  extraActions,
}: {
  action: Action<T>;
  submitLabel: string;
  pendingLabel?: string;
  children?: ReactNode;
  className?: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
  renderResult?: (state: ClientFormState<T>) => ReactNode;
  /** Envía una clave única por operación: reenvíos o doble clic no duplican el registro. */
  idempotent?: boolean;
  submitName?: string;
  submitValue?: string;
  /** Botones adicionales (p. ej. name="intent" value="submit"). */
  extraActions?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false } as ClientFormState<T>);
  const formRef = useRef<HTMLFormElement>(null);

  // React 19 vacía el formulario tras cada envío; aquí solo se limpia si la
  // acción tuvo éxito, para que el usuario no reescriba sus datos tras un error.
  const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());
  // Tras un éxito se vuelven a montar los campos: los controles con estado
  // propio (selectores, autocompletado) quedan coherentes con lo que se ve.
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (state.ok) {
      setGeneration((g) => g + 1);
      setIdemKey(crypto.randomUUID());
    }
  }, [state]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(fd));
  }

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className={cn("grid gap-4", className)} noValidate={false}>
      {idempotent && <input type="hidden" name="idempotencyKey" value={idemKey} />}
      <Fragment key={generation}>{children}</Fragment>
      {state.fieldErrors && (
        <ul className="text-sm text-destructive" aria-live="polite">
          {Object.entries(state.fieldErrors).map(([k, v]) => (
            <li key={k}>{v}</li>
          ))}
        </ul>
      )}
      {state.error && <Alert variant="error">{state.error}</Alert>}
      {state.ok && state.message && <Alert variant="success">{state.message}</Alert>}
      {renderResult?.(state)}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name={submitName} value={submitValue} disabled={pending} aria-disabled={pending} variant={variant}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        {extraActions}
      </div>
    </form>
  );
}
