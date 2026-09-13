"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/** A submit button that swaps to `pendingChildren` while its form is submitting. Must be rendered inside that form. Pass `confirmMessage` to require a confirm() dialog before the form submits. */
export function PendingButton({
  children = "✕",
  pendingChildren = "…",
  className,
  confirmMessage,
}: {
  children?: ReactNode;
  pendingChildren?: ReactNode;
  className?: string;
  confirmMessage?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {pending ? pendingChildren : children}
    </button>
  );
}
