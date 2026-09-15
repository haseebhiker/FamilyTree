"use client";

/** Renders a timestamp in the viewer's own browser timezone (not the server's). */
export function LocalTime({ iso }: { iso: string }) {
  return <>{new Date(iso).toLocaleString()}</>;
}
