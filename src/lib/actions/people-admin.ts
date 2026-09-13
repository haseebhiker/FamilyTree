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

export async function hardDeletePerson(formData: FormData) {
  const { supabase, member } = await requireAdmin();
  const personId = String(formData.get("person_id") ?? "");
  const confirmName = String(formData.get("confirm_name") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!personId || !reason) throw new Error("A reason is required");

  const { data: person } = await supabase.from("people").select("full_name").eq("id", personId).single();
  if (!person || person.full_name.trim() !== confirmName) {
    throw new Error("Typed name doesn't match — deletion cancelled");
  }

  await supabase.from("audit_log").insert({
    person_id: personId,
    change_type: "hard_delete",
    old_value: person,
    new_value: null,
    performed_by: member.id,
    note: reason,
  });

  const { error } = await supabase.from("people").delete().eq("id", personId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/people");
  revalidatePath("/");
}

/**
 * Merges `loser_id` into `keeper_id`: repoints every father/mother/spouse
 * reference from loser to keeper, then deletes the loser. Used from
 * People Management to resolve the duplicate-name candidates the legacy
 * import flagged (design doc §9).
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

  await supabase.from("people").update({ father_id: keeperId }).eq("father_id", loserId);
  await supabase.from("people").update({ mother_id: keeperId }).eq("mother_id", loserId);
  await supabase.from("spouses").update({ person_a_id: keeperId }).eq("person_a_id", loserId);
  await supabase.from("spouses").update({ person_b_id: keeperId }).eq("person_b_id", loserId);
  await supabase.from("members").update({ person_id: keeperId }).eq("person_id", loserId);
  await supabase.from("invites").update({ person_id: keeperId }).eq("person_id", loserId);

  await supabase.from("audit_log").insert({
    person_id: keeperId,
    change_type: "merge",
    old_value: loser,
    new_value: { merged_into: keeperId },
    performed_by: member.id,
    note: `Merged ${loser.full_name} (${loserId}) into this profile`,
  });

  const { error } = await supabase.from("people").delete().eq("id", loserId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/people");
  revalidatePath("/");
}
