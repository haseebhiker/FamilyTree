"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";

export type PhotoResult = { status: "applied" | "pending" } | { error: string };

/**
 * Records where the browser already put the photo (see
 * person-photo-upload.tsx — the actual Storage upload happens client-side
 * before this is called). The profile's owner or an admin changes it
 * immediately (and Storage drops the old files). Anyone else — e.g. a child
 * uploading their parent's photo — files it as a normal "edit profile"
 * suggestion for an admin to approve; the photo only appears once approved.
 * Errors are returned, not thrown (a thrown Server Action error reaches the
 * browser as a stripped "#441").
 */
export async function updatePersonPhoto(
  personId: string,
  photoUrl: string,
  photoThumbnailUrl: string,
  previousPaths: { photoPath: string | null; thumbnailPath: string | null },
): Promise<PhotoResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not signed in" };
    const member = await getCurrentMember(supabase, user.id);
    if (!member) return { error: "Not authorized" };

    if (member.person_id !== personId && !isAdmin(member)) {
      const { data: current } = await supabase
        .from("people")
        .select("photo_url, photo_thumbnail_url")
        .eq("id", personId)
        .maybeSingle();
      const { error } = await supabase.from("pending_changes").insert({
        change_type: "edit_person",
        target_person_id: personId,
        proposed_data: { photo_url: photoUrl, photo_thumbnail_url: photoThumbnailUrl },
        previous_data: { photo_url: current?.photo_url ?? null, photo_thumbnail_url: current?.photo_thumbnail_url ?? null },
        note: "New photo",
        submitted_by: member.id,
        status: "pending",
      });
      if (error) return { error: error.message };
      return { status: "pending" };
    }

    const { error } = await supabase
      .from("people")
      .update({ photo_url: photoUrl, photo_thumbnail_url: photoThumbnailUrl, updated_at: new Date().toISOString() })
      .eq("id", personId);
    if (error) return { error: error.message };

    // Best-effort cleanup — a failed delete here (e.g. a non-admin uploader,
    // since only admins can delete per the storage policy) shouldn't block
    // the photo change that already succeeded.
    const toRemove = [previousPaths.photoPath, previousPaths.thumbnailPath].filter((p): p is string => !!p);
    if (toRemove.length > 0) {
      await supabase.storage.from("person-photos").remove(toRemove);
    }
    return { status: "applied" };
  } catch (e) {
    console.error("[updatePersonPhoto]", e);
    return { error: e instanceof Error ? e.message : "Something went wrong — please try again." };
  }
}

/** Clears a person's photo back to the initials placeholder. Same permission model and best-effort storage cleanup as updatePersonPhoto above. */
export async function removePersonPhoto(
  personId: string,
  previousPaths: { photoPath: string | null; thumbnailPath: string | null },
): Promise<{ ok: true } | { error: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not signed in" };
    const member = await getCurrentMember(supabase, user.id);
    if (!member) return { error: "Not authorized" };
    if (member.person_id !== personId && !isAdmin(member)) {
      return { error: "Only the profile owner or an admin can remove this photo" };
    }

    const { error } = await supabase
      .from("people")
      .update({ photo_url: null, photo_thumbnail_url: null, updated_at: new Date().toISOString() })
      .eq("id", personId);
    if (error) return { error: error.message };

    const toRemove = [previousPaths.photoPath, previousPaths.thumbnailPath].filter((p): p is string => !!p);
    if (toRemove.length > 0) {
      await supabase.storage.from("person-photos").remove(toRemove);
    }
    return { ok: true };
  } catch (e) {
    console.error("[removePersonPhoto]", e);
    return { error: e instanceof Error ? e.message : "Something went wrong — please try again." };
  }
}
