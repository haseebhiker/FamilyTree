"use client";

import { useEffect } from "react";

/**
 * When a browser navigates back/forward — or, on some platforms, simply
 * resumes a backgrounded tab or an "Add to Home Screen" app — it can
 * restore a fully frozen, previously-rendered copy of the page from memory
 * (the back-forward cache) instead of making a real network request. No
 * request means no Cache-Control header is ever consulted, so a page that
 * was already stale when it got frozen stays stale indefinitely, showing
 * whatever nav bar, pending-count badges, etc. were true at freeze time —
 * exactly the "keeps showing the old menu" pattern, and not specific to
 * the installed PWA the way it first looked, since bfcache applies to a
 * plain browser tab too. The `pageshow` event's `persisted` flag is how a
 * page tells this apart from a normal fresh load; forcing a real reload
 * when it fires guarantees this app is never looking at a frozen copy.
 */
export function BfcacheReload() {
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        window.location.reload();
      }
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  return null;
}
