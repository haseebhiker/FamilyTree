"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Calls clearPageViewLog directly (not a bare `<form action>`) so a bad or
 * missing date shows an inline message instead of Next's generic error
 * boundary — see ActionButton's comment for the fuller account of why a
 * thrown Server Action error needs a client-side catch here.
 */
export function ClearActivityLogForm({
  clearPageViewLog,
}: {
  clearPageViewLog: (formData: FormData) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [upToDate, setUpToDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClear() {
    if (!upToDate) return;
    if (!window.confirm(`Clear all activity logged on or before ${upToDate}? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("up_to", upToDate);
        await clearPageViewLog(formData);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong — please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor="clear-up-to" className="text-xs text-slate-500">
          Clear entries up to and including:
        </label>
        <input
          id="clear-up-to"
          type="date"
          value={upToDate}
          max={today}
          onChange={(e) => setUpToDate(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={handleClear}
          disabled={isPending || !upToDate}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {isPending ? "Clearing…" : "Clear log"}
        </button>
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
