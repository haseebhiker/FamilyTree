"use client";

import { useRouter } from "next/navigation";

/**
 * A checkbox that updates a URL query param immediately on change — no
 * submit button, for a page that reads the param server-side to filter
 * what it shows. Reads the current URL directly via `window.location`
 * rather than `useSearchParams()`, which would require wrapping this in a
 * `<Suspense>` boundary wherever it's used.
 */
export function AutoSubmitCheckbox({
  param,
  defaultChecked,
  label,
}: {
  param: string;
  defaultChecked: boolean;
  label: string;
}) {
  const router = useRouter();

  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <input
        type="checkbox"
        defaultChecked={defaultChecked}
        onChange={(e) => {
          const params = new URLSearchParams(window.location.search);
          if (e.target.checked) {
            params.set(param, "1");
          } else {
            params.delete(param);
          }
          const query = params.toString();
          router.push(query ? `${window.location.pathname}?${query}` : window.location.pathname);
        }}
      />
      {label}
    </label>
  );
}
