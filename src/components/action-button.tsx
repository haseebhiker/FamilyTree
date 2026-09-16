"use client";

import { useState, useTransition, type ReactNode } from "react";

/**
 * A button that calls a Server Action directly (not via `<form action>`)
 * and catches whatever it throws, showing the message inline instead of
 * losing it. A plain `<form action={serverAction}>` has no client-side
 * catch anywhere in the chain — when the action throws (by design, e.g. a
 * validation error meant to be shown to the admin), the throw bubbles up
 * to Next's generic error boundary instead, which replaces a specific,
 * useful message with an opaque "Minified React error #441" screen.
 * Confirmed live: deleteInvite's deliberate "can't delete, a member still
 * references this" error did exactly that before this component existed.
 */
export function ActionButton({
  action,
  fields,
  confirmMessage,
  className,
  pendingChildren = "…",
  children,
}: {
  action: (formData: FormData) => Promise<unknown>;
  /** Built into a real FormData client-side, right before calling the action — a FormData instance itself doesn't survive being passed as a prop from the Server Component that renders this. */
  fields: Record<string, string>;
  confirmMessage?: string;
  className?: string;
  pendingChildren?: ReactNode;
  children: ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        for (const [key, value] of Object.entries(fields)) formData.set(key, value);
        await action(formData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong — please try again.");
      }
    });
  }

  return (
    <div>
      <button type="button" onClick={handleClick} disabled={isPending} className={className}>
        {isPending ? pendingChildren : children}
      </button>
      {error && <p className="mt-1 max-w-xs text-xs text-red-600">{error}</p>}
    </div>
  );
}
