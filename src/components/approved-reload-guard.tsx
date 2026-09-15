"use client";

import { useEffect } from "react";

/**
 * Belt-and-suspenders alongside the app-wide BfcacheReload: that one relies
 * on the standard `pageshow`/`persisted` bfcache-restore event, but
 * WhatsApp's iOS in-app browser has been observed showing this exact
 * "You're approved!" screen stale (stuck on an old verdict from before it
 * was true) without ever firing that event reliably. `visibilitychange` is
 * a second, more broadly-supported signal for "this tab just came back into
 * view" that catches the same app-switch/backgrounding case a different way.
 * Scoped to only this success screen (not mounted app-wide) because it has
 * no unsaved state to lose — unlike the request-access form on this same
 * page, which a blind reload-on-refocus would silently wipe mid-typing.
 */
export function ApprovedReloadGuard() {
  useEffect(() => {
    let wasHidden = false;
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        wasHidden = true;
      } else if (document.visibilityState === "visible" && wasHidden) {
        window.location.reload();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return null;
}
