"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Input, Textarea, Button } from "@/components/ui";

interface MemberOption {
  id: string;
  name: string;
  email: string;
}

const DEFAULT_SUBJECT = "What's new on Nams Family Tree";
const DEFAULT_BODY = `Hi {{name}},

Thank you for everything you've added to the Family Tree — every change counts, and it's growing because of you.

A few new things to try:
- Leaderboard: tap the trophy icon at the top to see who has contributed the most this month, and of all time
- Relationship terms in Tamil: when you look at how you're related to someone, you'll now see the Tamil word too
- Share button: on any person's page, send someone a direct link to that profile
- Quick Edit (in the ☰ menu): fill in birthdays and other basics for many people quickly
- Photos: tap the camera on a profile to add or change a photo

If you spot anything missing or wrong, please add it or fix it — the tree is only as good as what we all put into it.

https://familytree.haseeb.in`;

export function AnnouncementComposer({
  members,
  sendAnnouncementEmails,
}: {
  members: MemberOption[];
  sendAnnouncementEmails: (formData: FormData) => Promise<{ sent: number; failed: number } | { error: string }>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(members.map((m) => m.id)));
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
    if (!window.confirm(`Send this to ${selected.size} ${selected.size === 1 ? "person" : "people"}?`)) return;
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("subject", subject);
        formData.set("body", body);
        for (const id of selected) formData.append("member_id", id);
        const res = await sendAnnouncementEmails(formData);
        if ("error" in res) setError(res.error);
        else setResult(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong — please try again.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs">
        <button type="button" onClick={() => setSelected(new Set(members.map((m) => m.id)))} className="font-medium text-slate-600 hover:underline">
          Select all
        </button>
        <button type="button" onClick={() => setSelected(new Set())} className="font-medium text-slate-600 hover:underline">
          Deselect all
        </button>
        <span className="text-slate-400">{selected.size} of {members.length} selected</span>
      </div>
      <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
        {members.map((m) => (
          <label key={m.id} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
            {m.name} <span className="text-slate-400">({m.email})</span>
          </label>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="space-y-2">
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" required />
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={"Your message — use {{name}} to greet each person by name"}
          rows={16}
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
  );
}
