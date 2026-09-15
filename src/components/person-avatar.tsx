"use client";

import { useState } from "react";

/** Falls back to the initials placeholder if photo_url isn't actually a loadable image (e.g. someone typed a name into that field instead of a link). */
export function PersonAvatar({ photoUrl, fullName }: { photoUrl: string | null; fullName: string }) {
  const [failed, setFailed] = useState(false);

  if (!photoUrl || failed) {
    return (
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-200 text-2xl font-semibold text-slate-500">
        {fullName.charAt(0)}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external URL, not a static asset
    <img
      src={photoUrl}
      alt={fullName}
      className="h-24 w-24 rounded-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
