"use client";

import { useState } from "react";
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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
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
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div>
      <label className="inline-block cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
        {uploading ? "Uploading…" : hasExistingPhoto ? "Change photo" : "Add a photo"}
        <input type="file" accept="image/*" onChange={handleChange} disabled={uploading} className="hidden" />
      </label>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
