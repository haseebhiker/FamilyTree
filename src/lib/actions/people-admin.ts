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

  revalidatePath("/admin/people");
  revalidatePath(`/people/${personId}`);
  revalidatePath("/");
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
  await supabase.from("spouses").update({ person_a_id: keeperId }).eq("person_a_id", loserId);
  await supabase.from("spouses").update({ person_b_id: keeperId }).eq("person_b_id", loserId);
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
