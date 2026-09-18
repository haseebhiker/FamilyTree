"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";
import { updatePersonPhoto, removePersonPhoto } from "@/lib/actions/person-photo";
import { PhotoLightbox } from "@/components/photo-lightbox";

const BUCKET = "person-photos";
const THUMBNAIL_SIZE = 200;

/**
 * Center-cropped square thumbnail, drawn on a canvas rather than left to
 * browser-image-compression's own resize (which preserves aspect ratio —
 * fine for the full photo, but this needs an exact 200x200 square).
 */
async function createSquareThumbnail(file: File, size = THUMBNAIL_SIZE): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't prepare a thumbnail in this browser");

  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const sw = size / scale;
  const sh = size / scale;
  const sx = (bitmap.width - sw) / 2;
  const sy = (bitmap.height - sh) / 2;
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, size, size);
  bitmap.close();

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare a thumbnail in this browser"))), "image/webp", 0.85),
  );
  return new File([blob], "thumbnail.webp", { type: "image/webp" });
}

/** Only ever true for a URL this same upload flow produced — an admin's old hand-typed external link isn't ours to delete. */
function pathFromOurUrl(url: string | null, supabaseUrl: string): string | null {
  if (!url) return null;
  const prefix = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

/**
 * Shared by the two upload UIs (the Edit form's button, and the avatar
 * overlay at the top of the profile) so the compress/upload/save logic —
 * and the transition wrapping it, needed because it calls a Server Action
 * directly rather than through a <form action> — only exists in one place.
 */
function usePersonPhotoUpload({
  personId,
  previousPhotoUrl,
  previousThumbnailUrl,
}: {
  personId: string;
  previousPhotoUrl: string | null;
  previousThumbnailUrl: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const input = e.target;
    if (!file) return;
    setError(null);
    startTransition(async () => {
      try {
        const [compressedFull, thumbnail] = await Promise.all([
          imageCompression(file, { maxSizeMB: 0.2, fileType: "image/webp", useWebWorker: true }),
          createSquareThumbnail(file),
        ]);

        const supabase = createClient();
        const id = crypto.randomUUID();
        const fullPath = `${personId}/${id}.webp`;
        const thumbPath = `${personId}/${id}-thumb.webp`;

        const [fullUpload, thumbUpload] = await Promise.all([
          supabase.storage.from(BUCKET).upload(fullPath, compressedFull, { contentType: "image/webp" }),
          supabase.storage.from(BUCKET).upload(thumbPath, thumbnail, { contentType: "image/webp" }),
        ]);
        if (fullUpload.error) throw fullUpload.error;
        if (thumbUpload.error) throw thumbUpload.error;

        const photoUrl = supabase.storage.from(BUCKET).getPublicUrl(fullPath).data.publicUrl;
        const thumbnailUrl = supabase.storage.from(BUCKET).getPublicUrl(thumbPath).data.publicUrl;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

        await updatePersonPhoto(personId, photoUrl, thumbnailUrl, {
          photoPath: pathFromOurUrl(previousPhotoUrl, supabaseUrl),
          thumbnailPath: pathFromOurUrl(previousThumbnailUrl, supabaseUrl),
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed — please try again.");
      } finally {
        input.value = "";
      }
    });
  }

  function handleRemove() {
    if (!window.confirm("Remove this photo?")) return;
    setError(null);
    startTransition(async () => {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        await removePersonPhoto(personId, {
          photoPath: pathFromOurUrl(previousPhotoUrl, supabaseUrl),
          thumbnailPath: pathFromOurUrl(previousThumbnailUrl, supabaseUrl),
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't remove the photo — please try again.");
      }
    });
  }

  return { isPending, error, handleChange, handleRemove };
}

export function PersonPhotoUpload({
  personId,
  hasExistingPhoto,
  previousPhotoUrl,
  previousThumbnailUrl,
}: {
  personId: string;
  hasExistingPhoto: boolean;
  previousPhotoUrl: string | null;
  previousThumbnailUrl: string | null;
}) {
  const { isPending, error, handleChange, handleRemove } = usePersonPhotoUpload({
    personId,
    previousPhotoUrl,
    previousThumbnailUrl,
  });

  return (
    <div>
      <div className="flex items-center gap-3">
        <label className="inline-block cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          {isPending ? "Working…" : hasExistingPhoto ? "Change photo" : "Add a photo"}
          <input type="file" accept="image/*" onChange={handleChange} disabled={isPending} className="hidden" />
        </label>
        {hasExistingPhoto && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={isPending}
            className="text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            Remove photo
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M6.5 3.5A1.5 1.5 0 0 1 7.87 2.5h4.26a1.5 1.5 0 0 1 1.37 1l.27.5H15a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h1.36l.27-.5ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.25H3.5a.75.75 0 0 0 0 1.5h.325l.723 9.4A2.75 2.75 0 0 0 7.29 17.5h5.42a2.75 2.75 0 0 0 2.742-2.6l.723-9.4h.325a.75.75 0 0 0 0-1.5H14v-.25A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4h2.5v-.25c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25V4H10Zm-2 3.75a.75.75 0 0 1 1.5 0v6.5a.75.75 0 0 1-1.5 0v-6.5ZM11.25 7a.75.75 0 0 0-.75.75v6.5a.75.75 0 0 0 1.5 0v-6.5a.75.75 0 0 0-.75-.75Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * The avatar itself, tappable to upload or replace the photo — for the
 * owner/admin only, who already see the same upload flow in the Edit form's
 * Photo field. This is a shortcut to it, not a separate feature, so it
 * shares usePersonPhotoUpload rather than duplicating the compress/upload
 * logic.
 */
export function PersonAvatarUpload({
  personId,
  photoUrl,
  thumbnailUrl,
  fullName,
  previousPhotoUrl,
  previousThumbnailUrl,
}: {
  personId: string;
  photoUrl: string | null;
  thumbnailUrl: string | null;
  fullName: string;
  previousPhotoUrl: string | null;
  previousThumbnailUrl: string | null;
}) {
  const { isPending, error, handleChange, handleRemove } = usePersonPhotoUpload({
    personId,
    previousPhotoUrl,
    previousThumbnailUrl,
  });
  const [failed, setFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const src = thumbnailUrl || photoUrl;
  const hasPhoto = !!src && !failed;

  return (
    <div>
      <div className="relative h-24 w-24">
        {hasPhoto ? (
          <button type="button" onClick={() => setLightboxOpen(true)} className="block h-24 w-24 rounded-full" title="View photo">
            {/* eslint-disable-next-line @next/next/no-img-element -- external URL, not a static asset */}
            <img
              src={src}
              alt={fullName}
              className="h-24 w-24 rounded-full object-cover"
              onError={() => setFailed(true)}
            />
          </button>
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-200 text-2xl font-semibold text-slate-500">
            {fullName.charAt(0)}
          </div>
        )}
        <label
          className="absolute right-0 bottom-0 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white shadow hover:bg-slate-700"
          title={hasPhoto ? "Change photo" : "Add a photo"}
        >
          {isPending ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <CameraIcon />
          )}
          <input type="file" accept="image/*" onChange={handleChange} disabled={isPending} className="hidden" />
        </label>
        {hasPhoto && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={isPending}
            title="Remove photo"
            className="absolute top-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-red-600 text-white shadow hover:bg-red-700 disabled:opacity-50"
          >
            <TrashIcon />
          </button>
        )}
      </div>
      {error && <p className="mt-1 max-w-24 text-[10px] text-red-600">{error}</p>}
      {lightboxOpen && photoUrl && <PhotoLightbox url={photoUrl} alt={fullName} onClose={() => setLightboxOpen(false)} />}
    </div>
  );
}
