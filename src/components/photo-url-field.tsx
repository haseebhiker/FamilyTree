"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Field, Input } from "@/components/ui";

/**
 * Replaces free-typing a photo URL (which kept ending up with things like a
 * Google Photos share link — a page that shows a photo, not a link to the
 * photo file itself, so it can never load as an <img>) with an actual file
 * upload straight to Supabase Storage from the browser. Never through a
 * Server Action: Vercel caps those request bodies well below a typical
 * photo's size.
 */
export function PhotoUrlField({ personId, defaultValue }: { personId: string; defaultValue: string }) {
  const [url, setUrl] = useState(defaultValue);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setPreviewFailed(false);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${personId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("photos").upload(path, file, {
        cacheControl: "3600",
      });
      if (uploadError) throw new Error(uploadError.message);
      const { data } = supabase.storage.from("photos").getPublicUrl(path);
      setUrl(data.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed — please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="sm:col-span-2 space-y-2">
      <Field label="Photo">
        <div className="flex items-center gap-3">
          {url && !previewFailed && (
            // eslint-disable-next-line @next/next/no-img-element -- external/uploaded URL, not a static asset
            <img
              src={url}
              alt=""
              className="h-16 w-16 shrink-0 rounded-full object-cover"
              onError={() => setPreviewFailed(true)}
            />
          )}
          <div className="flex-1 space-y-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={uploading}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-900 hover:file:bg-slate-200 disabled:opacity-50"
            />
            {uploading && <p className="text-xs text-slate-400">Uploading…</p>}
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        </div>
      </Field>
      <input type="hidden" name="photo_url" value={url} />
      <button
        type="button"
        onClick={() => setShowManual((s) => !s)}
        className="text-xs text-slate-400 hover:text-slate-600 hover:underline"
      >
        {showManual ? "Hide" : "Or paste a direct image link instead"}
      </button>
      {showManual && (
        <Input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setPreviewFailed(false);
          }}
          placeholder="https://example.com/photo.jpg — must link straight to the image file"
        />
      )}
    </div>
  );
}
