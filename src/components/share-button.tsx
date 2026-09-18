"use client";

import { useState } from "react";

function ShareIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.518 2.518 0 0 1 0 .792l6.732 3.367a2.5 2.5 0 1 1-.671 1.341L6.3 11.737a2.5 2.5 0 1 1 0-3.474l6.732-3.367A2.51 2.51 0 0 1 13 4.5Z" />
    </svg>
  );
}

/**
 * On mobile (or any browser that supports it), opens the native share
 * sheet — WhatsApp, Messages, copy link, whatever's installed. Falls back
 * to copying the link to the clipboard when navigator.share isn't
 * available (most desktop browsers), with a brief "Link copied" confirmation
 * since there's no OS-level share UI to confirm it for you there.
 */
export function ShareButton({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // User cancelled the share sheet — not an error.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied or unavailable — nothing more we can do here.
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        aria-label="Share"
        title="Share"
        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <ShareIcon />
      </button>
      {copied && (
        <span className="absolute top-full right-0 mt-1 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white">
          Link copied
        </span>
      )}
    </div>
  );
}
