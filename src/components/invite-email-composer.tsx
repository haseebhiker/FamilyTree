"use client";

import { useState, useTransition, type FormEvent } from "react";
import { ChevronIcon, Input, Textarea, Button } from "@/components/ui";

interface InviteOption {
  id: string;
  name: string;
  email: string;
}

/**
 * Compose one email and send it to some or all of the invites who haven't
 * signed in yet — for the case where an admin approved someone a while
 * back and they just never followed through, not the automatic "you're
 * approved" email that already goes out at approval time. {{name}} in the
 * message is replaced per-recipient.
 */
export function InviteEmailComposer({
  invites,
  sendInviteReminderEmails,
}: {
  invites: InviteOption[];
  sendInviteReminderEmails: (formData: FormData) => Promise<{ sent: number; failed: number }>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(invites.map((i) => i.id)));
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (invites.length === 0) return null;

  function toggle(id: string) {
    setSelected((s) => {
      const copy = new Set(s);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("subject", subject);
        formData.set("body", body);
        for (const id of selected) formData.append("invite_id", id);
        setResult(await sendInviteReminderEmails(formData));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong — please try again.");
      }
    });
  }

  return (
    <details className="group rounded-lg border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-900">
        <ChevronIcon className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
        Email invites who haven&apos;t signed in yet ({invites.length})
      </summary>
      <div className="space-y-3 border-t border-slate-100 p-4">
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
          {invites.map((inv) => (
            <label key={inv.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={selected.has(inv.id)} onChange={() => toggle(inv.id)} />
              {inv.name} <span className="text-slate-400">({inv.email})</span>
            </label>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="space-y-2">
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            required
          />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={"Your message — use {{name}} to greet each person by name"}
            rows={5}
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {result && (
            <p className="text-sm text-green-700">
              Sent to {result.sent}{result.failed > 0 ? `, ${result.failed} failed` : ""}.
            </p>
          )}
          <Button type="submit" disabled={isPending || selected.size === 0}>
            {isPending ? "Sending…" : `Send to ${selected.size} selected`}
          </Button>
        </form>
      </div>
    </details>
  );
}
