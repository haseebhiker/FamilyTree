"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

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
 *
 * router.refresh() after success, rather than relying solely on whatever
 * revalidatePath the action itself might call: a revalidatePath bundles
 * its re-render into the SAME response as the action, and this session
 * has repeatedly traced genuine (non-redacted-message) #441 crashes to
 * exactly that bundled render failing for reasons that never showed up in
 * static review or server-side error logging. A separate, client-
 * triggered refresh — the same mechanism EditPersonForm and
 * PersonPhotoUpload already use successfully — has been reliable every
 * time by contrast.
 */
export function ActionButton({
  action,
  fields,
  confirmMessage,
  className,
  pendingChildren = "…",
  children,
  inline = false,
}: {
  action: (formData: FormData) => Promise<unknown>;
  /** Built into a real FormData client-side, right before calling the action — a FormData instance itself doesn't survive being passed as a prop from the Server Component that renders this. */
  fields: Record<string, string>;
  confirmMessage?: string;
  className?: string;
  pendingChildren?: ReactNode;
  children: ReactNode;
  /** Use when this sits inline with surrounding text (e.g. next to a name in a list) — a block-level wrapper would push it to its own line. */
  inline?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        for (const [key, value] of Object.entries(fields)) formData.set(key, value);
        await action(formData);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong — please try again.");
      }
    });
  }

  const Wrapper = inline ? "span" : "div";
  return (
    <Wrapper>
      <button type="button" onClick={handleClick} disabled={isPending} className={className}>
        {isPending ? pendingChildren : children}
      </button>
      {error && (
        <span className={inline ? "ml-2 text-xs text-red-600" : "mt-1 block max-w-xs text-xs text-red-600"}>
          {error}
        </span>
      )}
    </Wrapper>
  );
}
