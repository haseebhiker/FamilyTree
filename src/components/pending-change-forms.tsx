"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input, Button } from "@/components/ui";
import { DisambiguatedName } from "@/components/person-name";

interface PersonLite {
  id: string;
  full_name: string;
  preferred_name?: string | null;
  surname_tag: string | null;
}

/**
 * Stacked on a phone (field name, then what it is now, then a full-width box
 * for what it will become) — three narrow side-by-side columns cut the
 * proposed value off ("Dr." for a whole full name) so the reviewer couldn't
 * see what was actually being changed. Side by side again from `sm` up,
 * where there's room.
 */
function DiffRow({ field, oldValue, newValue }: { field: string; oldValue: unknown; newValue: unknown }) {
  const oldEmpty = oldValue == null || oldValue === "";
  const newEmpty = newValue == null || newValue === "";
  return (
    <div className="space-y-1.5 border-b border-slate-100 py-3 text-sm sm:grid sm:grid-cols-[140px_1fr_1fr] sm:items-start sm:gap-2 sm:space-y-0 sm:py-1.5">
      <div className="font-semibold capitalize text-slate-700 sm:font-medium sm:normal-case sm:text-slate-500">
        {field.replace(/_/g, " ")}
      </div>
      <div className="break-words">
        <span className="text-xs font-medium text-slate-400 sm:hidden">Now: </span>
        {oldEmpty ? (
          <span className="italic text-slate-400">empty</span>
        ) : (
          <span className="text-red-700 line-through decoration-red-300">{String(oldValue)}</span>
        )}
      </div>
      <div>
        <span className="mb-0.5 block text-xs font-medium text-green-700 sm:hidden">Changing to:</span>
        <Input name={`edit_${field}`} defaultValue={newValue == null ? "" : String(newValue)} />
        {newEmpty && !oldEmpty && (
          <p className="mt-1 text-xs font-medium text-red-600">
            This clears the current value. To keep it, type it back into the box before approving.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Own client component rather than the bare `<form action={fn}>` this page
 * used before — that has no client-side catch anywhere in the chain, so
 * any thrown error (deliberate, like a NOT NULL constraint on a blanked-out
 * full_name, or a genuine render failure) bubbles to Next's generic error
 * boundary as a redacted "Minified React error #441" screen. router.
 * refresh() afterward, not the action's own revalidatePath — see
 * ActionButton's comment for why bundling a revalidatePath re-render into
 * the action's own response was the repeated source of those crashes.
 */
export function PendingChangeApproveForm({
  changeId,
  proposedEntries,
  previousData,
  approvePendingChange,
}: {
  changeId: string;
  proposedEntries: [string, unknown][];
  previousData: Record<string, unknown> | null;
  approvePendingChange: (formData: FormData) => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await approvePendingChange(formData);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong — please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input type="hidden" name="change_id" value={changeId} />
      <div>
        <div className="hidden grid-cols-[140px_1fr_1fr] gap-2 border-b border-slate-200 pb-1 text-xs font-semibold text-slate-500 sm:grid">
          <div>Field</div>
          <div>Current</div>
          <div>Proposed (editable)</div>
        </div>
        {proposedEntries.map(([field, newValue]) => (
          <DiffRow key={field} field={field} oldValue={previousData?.[field]} newValue={newValue} />
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {isPending ? "Approving…" : "Approve"}
        </button>
        {error && <p className="max-w-xs text-xs text-red-600">{error}</p>}
      </div>
    </form>
  );
}

/** Same fix as PendingChangeApproveForm, for change types that aren't a field-by-field edit (add_person, add_relationship, propose_deletion) — just the raw submitted details plus Approve, no per-field inputs to edit. */
export function PendingChangeApproveRaw({
  changeId,
  proposedEntries,
  peopleById,
  approvePendingChange,
}: {
  changeId: string;
  proposedEntries: [string, unknown][];
  peopleById: Map<string, PersonLite>;
  approvePendingChange: (formData: FormData) => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await approvePendingChange(formData);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong — please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input type="hidden" name="change_id" value={changeId} />
      <details className="rounded-md border border-slate-200 text-sm">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-500">Show raw submitted details</summary>
        <div className="border-t border-slate-100 p-3">
          {proposedEntries.map(([field, value]) => {
            const isPersonRef = field === "existing_person_id" || field === "relation_to_person_id";
            const linkedPerson = isPersonRef && typeof value === "string" ? peopleById.get(value) : null;
            return (
              <div key={field} className="border-b border-slate-100 py-1 last:border-0">
                <span className="font-medium text-slate-500">{field.replace(/_/g, " ")}: </span>
                {value == null || value === "" ? (
                  <span className="italic text-slate-400">empty</span>
                ) : linkedPerson ? (
                  <DisambiguatedName person={linkedPerson} />
                ) : (
                  String(value)
                )}
              </div>
            );
          })}
        </div>
      </details>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {isPending ? "Approving…" : "Approve"}
        </button>
        {error && <p className="max-w-xs text-xs text-red-600">{error}</p>}
      </div>
    </form>
  );
}

export function PendingChangeRejectForm({
  changeId,
  rejectPendingChange,
}: {
  changeId: string;
  rejectPendingChange: (formData: FormData) => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await rejectPendingChange(formData);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong — please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex items-center gap-2">
      <input type="hidden" name="change_id" value={changeId} />
      <Input name="admin_note" placeholder="Reason (optional, shown to submitter)" className="max-w-sm" />
      <div>
        <Button type="submit" variant="danger" disabled={isPending}>
          {isPending ? "Rejecting…" : "Reject"}
        </Button>
        {error && <p className="mt-1 max-w-xs text-xs text-red-600">{error}</p>}
      </div>
    </form>
  );
}
