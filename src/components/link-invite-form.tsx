"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Select } from "@/components/ui";

/** See LinkedAccountForm for why this needs to be its own client component instead of ActionForm's render-prop pattern. */
export function LinkInviteForm({
  personId,
  unlinkedInvites,
  linkInviteToPerson,
}: {
  personId: string;
  unlinkedInvites: { id: string; name: string; email: string }[];
  linkInviteToPerson: (formData: FormData) => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await linkInviteToPerson(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong — please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input type="hidden" name="person_id" value={personId} />
      <Select name="invite_id" className="w-auto text-xs" required defaultValue="">
        <option value="" disabled>
          Link to…
        </option>
        {unlinkedInvites.map((inv) => (
          <option key={inv.id} value={inv.id}>
            {inv.name} ({inv.email})
          </option>
        ))}
      </Select>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        {isPending ? "…" : "Link"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
