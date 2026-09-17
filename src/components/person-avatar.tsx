"use client";

import { useState } from "react";
import { PhotoLightbox } from "@/components/photo-lightbox";

/** Falls back to the initials placeholder if there's no photo, or it fails to load (e.g. an old hand-typed link that's since gone dead). Prefers the pre-generated 200x200 thumbnail over the full photo — smaller, and this avatar never renders larger than that anyway. Tapping it opens the full-size photo. */
export function PersonAvatar({
  photoUrl,
  thumbnailUrl,
  fullName,
}: {
  photoUrl: string | null;
  thumbnailUrl?: string | null;
  fullName: string;
}) {
  const [failed, setFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const src = thumbnailUrl || photoUrl;

  if (!src || failed) {
    return (
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-200 text-2xl font-semibold text-slate-500">
        {fullName.charAt(0)}
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setLightboxOpen(true)} className="block h-24 w-24 rounded-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- external URL, not a static asset */}
        <img
          src={src}
          alt={fullName}
          className="h-24 w-24 rounded-full object-cover"
          onError={() => setFailed(true)}
        />
      </button>
      {lightboxOpen && <PhotoLightbox url={photoUrl || src} alt={fullName} onClose={() => setLightboxOpen(false)} />}
    </>
  );
}
