"use client";

import { useEffect } from "react";
import { Card, Button } from "@/components/ui";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-12">
      <Card>
        <h2 className="text-lg font-semibold text-slate-900">Something went wrong</h2>
        <p className="mt-2 text-sm text-slate-600">
          {error.message || "An unexpected error occurred. Your other data is safe — this was just this one action."}
        </p>
        {/*
          A full reload, not retry(): retry() re-fetches this segment's data
          but keeps whatever JS the page already loaded. If the actual cause
          is that page having loaded before the app's most recent update —
          this app redeploys often, sometimes several times an hour — the
          browser is then calling a server action that no longer matches
          the current deployment, and retry() alone can never recover from
          that since it never fetches the updated code. A real reload does.
        */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => window.location.reload()}>Reload page</Button>
          <button
            type="button"
            onClick={() => retry()}
            className="text-sm text-slate-500 hover:text-slate-700 hover:underline"
          >
            Try again without reloading
          </button>
        </div>
      </Card>
    </div>
  );
}
