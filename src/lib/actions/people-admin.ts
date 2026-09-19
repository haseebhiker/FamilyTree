"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const member = await getCurrentMember(supabase, user.id);
  if (!isAdmin(member)) throw new Error("Admins only");
  return { supabase, member: member! };
}

/**
 * Soft delete only — genealogy data should never be truly destroyed by a
 * mistake. Marks the profile deleted_at/deleted_by/delete_reason instead
 * of removing the row; it disappears from normal browsing/search but an
 * admin can find and restore it from People Management at any time, and
 * anyone who still lands on it via an old link sees a "this profile has
 * been deleted" placeholder rather than a bare 404.
 */
export async function softDeletePerson(formData: FormData) {
  const { supabase, member } = await requireAdmin();
  const personId = String(formData.get("person_id") ?? "");
  const confirmName = String(formData.get("confirm_name") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!personId || !reason) throw new Error("A reason is required");

  const { data: person } = await supabase.from("people").select("full_name").eq("id", personId).single();
  if (!person || person.full_name.trim() !== confirmName) {
    throw new Error("Typed name doesn't match — deletion cancelled");
  }

  const { error } = await supabase
    .from("people")
    .update({ deleted_at: new Date().toISOString(), deleted_by: member.id, delete_reason: reason })
    .eq("id", personId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({
    person_id: personId,
    change_type: "soft_delete",
    old_value: person,
    new_value: null,
    performed_by: member.id,
    note: reason,
  });

  revalidatePath("/admin/people");
  revalidatePath(`/people/${personId}`);
  revalidatePath("/");
}

export async function restorePerson(formData: FormData) {
  const { supabase, member } = await requireAdmin();
  const personId = String(formData.get("person_id") ?? "");
  if (!personId) throw new Error("Missing person id");

  const { error } = await supabase
    .from("people")
    .update({ deleted_at: null, deleted_by: null, delete_reason: null })
    .eq("id", personId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({
    person_id: personId,
    change_type: "restore",
    old_value: null,
    new_value: null,
    performed_by: member.id,
  });

  // No revalidatePath — called directly from ActionButton (not a bare
  // <form action>), which does its own router.refresh() after success.
  // Bundling one into this action's own response was the repeated,
  // hard-to-pin-down source of "Minified React error #441" elsewhere in
  // this app; see ActionButton's comment for the fuller account.
}

/**
 * Unlinks a person from their father or mother — the parent-child equivalent
 * of "remove" on a contact detail. There's deliberately no "change
 * relationship" action: a wrong relationship (e.g. someone added as a son
 * who should actually be a husband) is fixed by removing the wrong link
 * here and then adding the correct one via the ordinary "Add a family
 * member" form, rather than a single action trying to handle every
 * from-type/to-type combination.
 */
export async function removeParentLink(formData: FormData) {
  const { supabase, member } = await requireAdmin();
  const personId = String(formData.get("person_id") ?? "");
  const which = String(formData.get("which") ?? "");
  if (!personId || (which !== "father" && which !== "mother")) throw new Error("Missing person or parent");

  const field = which === "father" ? "father_id" : "mother_id";
  const { data: before } = await supabase.from("people").select(field).eq("id", personId).single();

  const { error } = await supabase.from("people").update({ [field]: null }).eq("id", personId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({
    person_id: personId,
    change_type: "remove_relationship",
    old_value: before,
    new_value: { [field]: null },
    performed_by: member.id,
  });

  // No revalidatePath — see restorePerson's comment above.
}

/** Removes one spouse pairing entirely. See removeParentLink for why there's no direct "change" action. */
export async function removeSpouseLink(formData: FormData) {
  const { supabase, member } = await requireAdmin();
  const spouseRowId = String(formData.get("spouse_row_id") ?? "");
  const personId = String(formData.get("person_id") ?? "");
  if (!spouseRowId || !personId) throw new Error("Missing spouse link");

  const { data: before } = await supabase.from("spouses").select("*").eq("id", spouseRowId).single();
  const { error } = await supabase.from("spouses").delete().eq("id", spouseRowId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({
    person_id: personId,
    change_type: "remove_relationship",
    old_value: before,
    new_value: null,
    performed_by: member.id,
  });

  // No revalidatePath — see restorePerson's comment above.
}

/**
 * Merges `loser_id` into `keeper_id`: repoints every father/mother/spouse
 * reference from loser to keeper, then soft-deletes the loser (see
 * softDeletePerson above — never a real delete). Used from People
 * Management to resolve the duplicate-name candidates the legacy import
 * flagged (design doc §9).
 */
export async function mergePeople(formData: FormData) {
  const { supabase, member } = await requireAdmin();
  const keeperId = String(formData.get("keeper_id") ?? "");
  const loserId = String(formData.get("loser_id") ?? "");
  if (!keeperId || !loserId || keeperId === loserId) {
    throw new Error("Pick two different people to merge");
  }

  const { data: loser } = await supabase.from("people").select("*").eq("id", loserId).single();
  if (!loser) throw new Error("Person not found");
  const { data: keeper } = await supabase.from("people").select("full_name").eq("id", keeperId).single();

  await supabase.from("people").update({ father_id: keeperId }).eq("father_id", loserId);
  await supabase.from("people").update({ mother_id: keeperId }).eq("mother_id", loserId);

  // Spouse pairs are unique (least/greatest person id), so a duplicate who
  // shares the keeper's own spouse can't just be repointed — that would
  // collide with the keeper's existing row and silently fail. Drop the
  // now-redundant link instead; only repoint one to a partner the keeper
  // doesn't already have.
  const { data: keeperSpouses } = await supabase
    .from("spouses")
    .select("person_a_id, person_b_id")
    .or(`person_a_id.eq.${keeperId},person_b_id.eq.${keeperId}`);
  const keeperPartnerIds = new Set(
    (keeperSpouses ?? []).map((s) => (s.person_a_id === keeperId ? s.person_b_id : s.person_a_id)),
  );
  const { data: loserSpouses } = await supabase
    .from("spouses")
    .select("id, person_a_id, person_b_id")
    .or(`person_a_id.eq.${loserId},person_b_id.eq.${loserId}`);
  for (const s of loserSpouses ?? []) {
    const partnerId = s.person_a_id === loserId ? s.person_b_id : s.person_a_id;
    if (keeperPartnerIds.has(partnerId)) {
      await supabase.from("spouses").delete().eq("id", s.id);
    } else {
      const field = s.person_a_id === loserId ? "person_a_id" : "person_b_id";
      await supabase.from("spouses").update({ [field]: keeperId }).eq("id", s.id);
    }
  }

  await supabase.from("members").update({ person_id: keeperId }).eq("person_id", loserId);
  await supabase.from("invites").update({ person_id: keeperId }).eq("person_id", loserId);

  const { error } = await supabase
    .from("people")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: member.id,
      delete_reason: `Merged into ${keeper?.full_name ?? keeperId}`,
    })
    .eq("id", loserId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({
    person_id: keeperId,
    change_type: "merge",
    old_value: loser,
    new_value: { merged_into: keeperId },
    performed_by: member.id,
    note: `Merged ${loser.full_name} (${loserId}) into this profile`,
  });

  revalidatePath("/admin/people");
  revalidatePath("/");
}

/**
 * Legacy-import cleanup: clears the auto-generated `marriage_notes` prose on
 * spouse links.
 *
 * The old Legacy Family Tree site expressed relationships only as an English
 * sentence on each page ("X married Y /TAG/, daughter of A and B."), so
 * parse-legacy-tree.mjs captured that sentence verbatim. Every name in it is
 * ALSO parsed into real foreign keys — spouses.person_a_id/person_b_id and
 * people.father_id/mother_id — which is what the Spouse and Parents sections
 * actually render. The sentence is therefore a prose restatement of the graph
 * shown directly above it, complete with "//" artifacts where a surname tag
 * was empty.
 *
 * Only rows matching the generated shape are touched, so a genuine note an
 * admin typed later (a wedding date or place) is left alone. The previous
 * values go to audit_log first, making this recoverable.
 */
export async function cleanupSpouseNames() {
  const { supabase, member } = await requireAdmin();

  const { data: before, error: readError } = await supabase
    .from("spouses")
    .select("id, marriage_notes")
    .not("marriage_notes", "is", null)
    .like("marriage_notes", "% married %");
  if (readError) throw new Error(readError.message);
  if (!before || before.length === 0) return;

  const { error } = await supabase
    .from("spouses")
    .update({ marriage_notes: null })
    .in(
      "id",
      before.map((row) => row.id),
    );
  if (error) throw new Error(error.message);

  // person_id is deliberately null: this is a bulk maintenance action across
  // the spouses table, not a change to one person's profile.
  await supabase.from("audit_log").insert({
    person_id: null,
    change_type: "cleanup_marriage_notes",
    old_value: before,
    new_value: null,
    performed_by: member.id,
    note: `Cleared auto-generated marriage notes on ${before.length} spouse link${before.length === 1 ? "" : "s"}`,
  });

  revalidatePath("/admin/people");
  revalidatePath("/");
}
