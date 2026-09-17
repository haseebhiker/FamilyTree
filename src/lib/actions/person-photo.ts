"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";

/**
 * Records where the browser already put the photo (see
 * person-photo-upload.tsx — the actual Storage upload happens client-side
 * before this is called) and, if this replaces an existing photo, tells
 * Storage to delete the old files. Applies directly rather than going
 * through the pending_changes review queue, same trust level as contact
 * details: the profile's owner or an admin, immediately.
 */
export async function updatePersonPhoto(
  personId: string,
  photoUrl: string,
  photoThumbnailUrl: string,
  previousPaths: { photoPath: string | null; thumbnailPath: string | null },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const member = await getCurrentMember(supabase, user.id);
  if (!member) throw new Error("Not authorized");
  if (member.person_id !== personId && !isAdmin(member)) {
    throw new Error("Only the profile owner or an admin can change this photo");
  }

  const { error } = await supabase
    .from("people")
    .update({ photo_url: photoUrl, photo_thumbnail_url: photoThumbnailUrl, updated_at: new Date().toISOString() })
    .eq("id", personId);
  if (error) throw new Error(error.message);

  // Best-effort cleanup — a failed delete here (e.g. a non-admin uploader,
  // since only admins can delete per the storage policy) shouldn't block
  // the photo change that already succeeded.
  const toRemove = [previousPaths.photoPath, previousPaths.thumbnailPath].filter((p): p is string => !!p);
  if (toRemove.length > 0) {
    await supabase.storage.from("person-photos").remove(toRemove);
  }

  revalidatePath(`/people/${personId}`);
}
