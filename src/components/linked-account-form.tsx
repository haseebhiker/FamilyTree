"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui";

interface LinkedAccount {
  source: "member" | "invite";
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  accessRequest: { id: string; relation_description: string; notes: string | null } | null;
}

/**
 * Own client component rather than the generic ActionForm's render-prop
 * pattern, because this is rendered straight from page.tsx (a Server
 * Component) — a plain closure like ActionForm's `children` function can't
 * cross the Server-to-Client boundary as a prop. That's not a form-action
 * quirk, it's the same "functions aren't serializable" rule that blocks
 * passing any other callback into a Client Component; it only surfaced here
 * because this is the one form on the page whose per-field pending/error
 * state needed to live below page.tsx. Confirmed live: this exact form
 * threw the #441 Server Components render error on the "Me" page.
 */
export function LinkedAccountForm({
  acc,
  personId,
  updateLinkedAccount,
}: {
  acc: LinkedAccount;
  personId: string;
  updateLinkedAccount: (formData: FormData) => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await updateLinkedAccount(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong — please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="source" value={acc.source} />
      <input type="hidden" name="record_id" value={acc.id} />
      <input type="hidden" name="person_id" value={personId} />
      {acc.accessRequest && <input type="hidden" name="access_request_id" value={acc.accessRequest.id} />}
      <Field label="Name">
        <Input name="name" defaultValue={acc.name} />
      </Field>
      <Field label="Gmail">
        <Input name="email" type="email" defaultValue={acc.email} />
      </Field>
      <Field label="Role">
        <Select name="role" defaultValue={acc.role}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
          <option value="super_admin">Super admin</option>
        </Select>
      </Field>
      <div className="flex items-end text-sm text-slate-500">
        <span>
          <span className="font-medium text-slate-500">Status:</span> {acc.status}
          {acc.source === "invite" && (
            <span className="text-slate-400"> — invite record{acc.status === "accepted" ? ", already accepted" : ", hasn't signed in yet"}</span>
          )}
        </span>
      </div>
      {acc.accessRequest ? (
        <>
          <div className="sm:col-span-2">
            <Field label="How they said they're related">
              <Textarea name="relation_description" rows={2} defaultValue={acc.accessRequest.relation_description} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notes (optional)">
              <Textarea name="notes" rows={2} defaultValue={acc.accessRequest.notes ?? ""} />
            </Field>
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-400 sm:col-span-2">
          Invited directly — no access request on file to show a stated reason for.
        </p>
      )}
      <div className="sm:col-span-2 space-y-1">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </form>
  );
}
