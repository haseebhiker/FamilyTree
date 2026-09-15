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
        <Button className="mt-4" onClick={() => retry()}>
          Try again
        </Button>
      </Card>
    </div>
  );
}
