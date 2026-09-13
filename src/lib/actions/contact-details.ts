"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import type { ContactType, PrivacyVisibility } from "@/lib/types";

async function requireOwnerOrAdmin(personId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const member = await getCurrentMember(supabase, user.id);
  if (!member) throw new Error("Not authorized");
  if (member.person_id !== personId && !isAdmin(member)) {
    throw new Error("Only the profile owner or an admin can manage contact details");
  }
  return supabase;
}

export async function addContactDetail(formData: FormData) {
  const personId = String(formData.get("person_id") ?? "");
  if (!personId) throw new Error("Missing person id");
  const supabase = await requireOwnerOrAdmin(personId);

  const value = String(formData.get("value") ?? "").trim();
  if (!value) throw new Error("Value is required");

  const { error } = await supabase.from("contact_details").insert({
    person_id: personId,
    contact_type: String(formData.get("contact_type") ?? "phone") as ContactType,
    label: String(formData.get("label") ?? "").trim() || null,
    value,
    visibility: String(formData.get("visibility") ?? "admins_only") as PrivacyVisibility,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/people/${personId}`);
}

export async function deleteContactDetail(formData: FormData) {
  const personId = String(formData.get("person_id") ?? "");
  const contactId = String(formData.get("contact_id") ?? "");
  if (!personId || !contactId) throw new Error("Missing id");
  const supabase = await requireOwnerOrAdmin(personId);

  const { error } = await supabase.from("contact_details").delete().eq("id", contactId).eq("person_id", personId);
  if (error) throw new Error(error.message);

  revalidatePath(`/people/${personId}`);
}
