"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";

/**
 * Like ActionButton, but for a form with real inputs instead of fixed
 * fields known at render time (see ActionButton for why a bare
 * `<form action={fn}>` loses a Server Action's thrown error to Next's
 * generic #441 boundary). Submission is intercepted with onSubmit instead
 * of the action prop, so PendingButton's useFormStatus won't reflect
 * pending state here — children is a render prop that receives isPending
 * directly instead.
 */
export function ActionForm({
  action,
  className,
  confirmMessage,
  onSuccess,
  children,
}: {
  action: (formData: FormData) => Promise<unknown>;
  className?: string;
  confirmMessage?: string;
  onSuccess?: () => void;
  children: (state: { isPending: boolean; error: string | null }) => ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const result = await action(formData);
        // A Server Action's thrown error loses its message in production, so
        // actions used here return { error } instead of throwing.
        if (result && typeof result === "object" && "error" in result && typeof result.error === "string") {
          setError(result.error);
          return;
        }
        onSuccess?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong — please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      {children({ isPending, error })}
    </form>
  );
}
