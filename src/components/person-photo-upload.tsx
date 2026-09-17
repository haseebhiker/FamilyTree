"use client";

import { useState, useTransition } from "react";
import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";
import { updatePersonPhoto } from "@/lib/actions/person-photo";

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
 * and the transition wrapping it, needed because updatePersonPhoto calls
 * revalidatePath — only exists in one place.
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

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const input = e.target;
    if (!file) return;
    setError(null);
    // updatePersonPhoto calls revalidatePath, which — like every other
    // Server Action call in this app that isn't wired to a <form action> —
    // needs to run inside a transition, or the resulting cache refresh
    // throws a real (if cryptically minified) React error client-side.
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed — please try again.");
      } finally {
        input.value = "";
      }
    });
  }

  return { isPending, error, handleChange };
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
  const { isPending, error, handleChange } = usePersonPhotoUpload({ personId, previousPhotoUrl, previousThumbnailUrl });

  return (
    <div>
      <label className="inline-block cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
        {isPending ? "Uploading…" : hasExistingPhoto ? "Change photo" : "Add a photo"}
        <input type="file" accept="image/*" onChange={handleChange} disabled={isPending} className="hidden" />
      </label>
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
  const { isPending, error, handleChange } = usePersonPhotoUpload({ personId, previousPhotoUrl, previousThumbnailUrl });
  const [failed, setFailed] = useState(false);
  const src = thumbnailUrl || photoUrl;

  return (
    <div>
      <label
        className="group relative block h-24 w-24 cursor-pointer rounded-full"
        title={src ? "Change photo" : "Add a photo"}
      >
        {src && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element -- external URL, not a static asset
          <img
            src={src}
            alt={fullName}
            className="h-24 w-24 rounded-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-200 text-2xl font-semibold text-slate-500">
            {fullName.charAt(0)}
          </div>
        )}
        <span className="absolute inset-0 rounded-full bg-black/0 transition-colors group-hover:bg-black/20" />
        <span className="absolute right-0 bottom-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white shadow">
          {isPending ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <CameraIcon />
          )}
        </span>
        <input type="file" accept="image/*" onChange={handleChange} disabled={isPending} className="hidden" />
      </label>
      {error && <p className="mt-1 max-w-24 text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
