"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import { PRIVACY_FIELDS, type PrivacyVisibility } from "@/lib/types";

export async function updateFieldPrivacy(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const member = await getCurrentMember(supabase, user.id);
  if (!member) throw new Error("Not authorized");

  const personId = String(formData.get("person_id") ?? "");
  if (!personId) throw new Error("Missing person id");
  if (member.person_id !== personId && !isAdmin(member)) {
    throw new Error("Only the profile owner or an admin can change these settings");
  }

  const fieldsToUpdate = PRIVACY_FIELDS.filter((field) => formData.has(field));
  const groupSelections = new Map(
    fieldsToUpdate.map((field) => [field, formData.getAll(`groups_${field}`).map(String).filter(Boolean)]),
  );

  for (const field of fieldsToUpdate) {
    const visibility = String(formData.get(field)) as PrivacyVisibility;
    if (visibility === "groups" && (groupSelections.get(field) ?? []).length === 0) {
      throw new Error(`Pick at least one group for "${field.replace(/_/g, " ")}"`);
    }
  }

  const rows = fieldsToUpdate.map((field) => ({
    person_id: personId,
    field_name: field,
    visibility: String(formData.get(field)) as PrivacyVisibility,
    updated_at: new Date().toISOString(),
  }));

  if (rows.length === 0) return;

  const { data: upserted, error } = await supabase
    .from("field_privacy")
    .upsert(rows, { onConflict: "person_id,field_name" })
    .select("id, field_name");
  if (error) throw new Error(error.message);

  const groupsFieldPrivacyIds = (upserted ?? [])
    .filter((row) => groupSelections.get(row.field_name)?.length)
    .map((row) => row.id);

  if (groupsFieldPrivacyIds.length > 0) {
    await supabase.from("field_privacy_groups").delete().in("field_privacy_id", groupsFieldPrivacyIds);
    const groupRows = (upserted ?? []).flatMap((row) =>
      (groupSelections.get(row.field_name) ?? []).map((groupId) => ({
        field_privacy_id: row.id,
        group_id: groupId,
      })),
    );
    if (groupRows.length > 0) {
      const { error: groupsError } = await supabase.from("field_privacy_groups").insert(groupRows);
      if (groupsError) throw new Error(groupsError.message);
    }
  }

  revalidatePath(`/people/${personId}`);
}

export async function updatePrivacyDefaults(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const member = await getCurrentMember(supabase, user.id);
  if (!isAdmin(member)) throw new Error("Admins only");

  const rows = PRIVACY_FIELDS.filter((field) => formData.has(field)).map((field) => ({
    field_name: field,
    visibility: String(formData.get(field)) as PrivacyVisibility,
  }));

  const { error } = await supabase.from("privacy_defaults").upsert(rows, { onConflict: "field_name" });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/privacy-defaults");
}
