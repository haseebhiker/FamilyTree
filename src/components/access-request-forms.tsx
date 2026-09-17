"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Field, Select, Button, Input } from "@/components/ui";
import { PersonPicker, type PersonOption } from "@/components/person-picker";

/**
 * Own client components rather than the bare `<form action={fn}>` this
 * page used before — that has no client-side catch anywhere in the chain,
 * so any thrown error (deliberate or a genuine render failure) bubbles to
 * Next's generic error boundary as a redacted "Minified React error #441"
 * screen instead of a useful message. Confirmed live on this exact
 * "Approve" button. router.refresh() afterward, not the action's own
 * revalidatePath — this session traced repeated #441 crashes to
 * revalidatePath bundling its re-render into the action's own response;
 * see ActionButton's comment for the fuller account.
 */
export function ApproveRequestForm({
  requestId,
  people,
  defaultPersonId,
  canAssignAdmin,
  approveAccessRequest,
}: {
  requestId: string;
  people: PersonOption[];
  defaultPersonId?: string;
  canAssignAdmin: boolean;
  approveAccessRequest: (formData: FormData) => Promise<unknown>;
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
        await approveAccessRequest(formData);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong — please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="request_id" value={requestId} />
      <Field label="Role">
        <Select name="role" defaultValue="member" disabled={!canAssignAdmin}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </Select>
      </Field>
      <Field label="Link to existing profile (optional)">
        <div className="min-w-56">
          <PersonPicker name="person_id" people={people} placeholder="Search by name…" defaultPersonId={defaultPersonId} />
        </div>
      </Field>
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Approving…" : "Approve"}
        </Button>
        {error && <p className="mt-1 max-w-xs text-xs text-red-600">{error}</p>}
      </div>
    </form>
  );
}

export function RejectRequestForm({
  requestId,
  rejectAccessRequest,
}: {
  requestId: string;
  rejectAccessRequest: (formData: FormData) => Promise<unknown>;
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
        await rejectAccessRequest(formData);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong — please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex items-center gap-2">
      <input type="hidden" name="request_id" value={requestId} />
      <Input name="admin_note" placeholder="Reason (optional, shown to requester)" className="max-w-sm" />
      <div>
        <Button type="submit" variant="danger" disabled={isPending}>
          {isPending ? "Rejecting…" : "Reject"}
        </Button>
        {error && <p className="mt-1 max-w-xs text-xs text-red-600">{error}</p>}
      </div>
    </form>
  );
}
