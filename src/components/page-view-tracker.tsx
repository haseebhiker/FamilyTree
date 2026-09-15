"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
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
 */
export function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    recordPageView(pathname);
  }, [pathname]);

  return null;
}
