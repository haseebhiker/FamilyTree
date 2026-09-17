"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { recordPageView } from "@/lib/actions/page-view-log";

/**
 * Logs a page view once per real navigation. Deliberately client-side
 * (usePathname + useEffect) rather than in middleware: an effect only runs
 * once React actually mounts the page in the browser, which Next.js's own
 * <Link> prefetching never triggers — prefetching fetches the RSC payload
 * in the background but doesn't execute the destination page's effects
 * until someone genuinely navigates there. Mounted once in (app)/layout.tsx
 * so it re-fires on every client-side route change without needing to be
 * added to each page individually.
 *
 * Includes the query string (e.g. /compare?a=X&b=Y), not just the
 * pathname — otherwise every Compare visit logs as the same bare
 * "Compare Relationship" with no way to tell which two people it was.
 * useSearchParams() needs a Suspense boundary around it.
 */
function PageViewTrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    recordPageView(query ? `${pathname}?${query}` : pathname);
  }, [pathname, searchParams]);

  return null;
}

export function PageViewTracker() {
  return (
    <Suspense fallback={null}>
      <PageViewTrackerInner />
    </Suspense>
  );
}
