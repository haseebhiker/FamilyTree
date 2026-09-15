"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import { encryptValue } from "@/lib/vault-crypto";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
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

  const contactType = String(formData.get("contact_type") ?? "phone") as ContactType;

  let plainValue: string;
  if (contactType === "phone") {
    const countryIso2 = String(formData.get("country_iso2") ?? "").trim();
    const localNumber = String(formData.get("local_number") ?? "").trim();
    if (!countryIso2) throw new Error("Country is required for a phone number");
    if (!localNumber) throw new Error("Phone number is required");
    const parsed = parsePhoneNumberFromString(localNumber, countryIso2 as CountryCode);
    if (!parsed || !parsed.isValid()) throw new Error("That doesn't look like a valid phone number for the selected country");
    plainValue = parsed.number; // E.164, e.g. +14155551234
  } else {
    plainValue = String(formData.get("value") ?? "").trim();
    if (!plainValue) throw new Error("Value is required");
  }

  const visibility = String(formData.get("visibility") ?? "admins_only") as PrivacyVisibility;
  const groupIds = formData.getAll("group_ids").map(String).filter(Boolean);
  if (visibility === "groups" && groupIds.length === 0) {
    throw new Error("Pick at least one group when visibility is set to groups");
  }

  const { data: inserted, error } = await supabase
    .from("contact_details")
    .insert({
      person_id: personId,
      contact_type: contactType,
      label: String(formData.get("label") ?? "").trim() || null,
      value: encryptValue(plainValue),
      visibility,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (visibility === "groups") {
    const { error: groupsError } = await supabase
      .from("contact_detail_groups")
      .insert(groupIds.map((groupId) => ({ contact_detail_id: inserted.id, group_id: groupId })));
    if (groupsError) throw new Error(groupsError.message);
  }

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
