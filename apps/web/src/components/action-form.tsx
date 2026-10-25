"use client";

import { Alert, Button, cn } from "@rc/ui";
import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";

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
}: {
  action: Action<T>;
  submitLabel: string;
  pendingLabel?: string;
  children?: ReactNode;
  className?: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
  renderResult?: (state: ClientFormState<T>) => ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false } as ClientFormState<T>);
  const formRef = useRef<HTMLFormElement>(null);

  // React 19 vacía el formulario tras cada envío; aquí solo se limpia si la
  // acción tuvo éxito, para que el usuario no reescriba sus datos tras un error.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className={cn("grid gap-4", className)} noValidate={false}>
      {children}
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
      <div>
        <Button type="submit" disabled={pending} aria-disabled={pending} variant={variant}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
