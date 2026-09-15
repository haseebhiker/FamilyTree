"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import type { Member, Person, PendingChangeType } from "@/lib/types";
import { parsePartialDateFields } from "@/lib/partial-date";

const EDITABLE_PERSON_TEXT_FIELDS = [
  "full_name",
  "preferred_name",
  "other_names",
  "surname_tag",
  "living_status",
  "place_of_birth",
  "place_of_death",
  "current_location",
  "photo_url",
  "bio",
  "facebook_url",
  "linkedin_url",
] as const;

const EDITABLE_PERSON_DATE_FIELDS = [
  { prefix: "birth", year: "birth_year", month: "birth_month", day: "birth_day" },
  { prefix: "death", year: "death_year", month: "death_month", day: "death_day" },
] as const;

async function requireMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const member = await getCurrentMember(supabase, user.id);
  if (!member) throw new Error("Not authorized");
  return { supabase, member };
}

async function requireAdmin() {
  const { supabase, member } = await requireMember();
  if (!isAdmin(member)) throw new Error("Admins only");
  return { supabase, member };
}

async function notifyAdminsOfPendingChange() {
  // Email notification hook (design doc §11.4) — wired up once RESEND_API_KEY
  // is configured. Intentionally a no-op until then rather than failing the
  // submission over a missing env var.
}

async function notifySubmitterOfDecision() {
  // Same as above, for the "your edit was approved/rejected" email.
}

/**
 * Applies one change's proposed_data to the live tables. Shared by (a) the
 * admin approval action and (b) an admin's own edit, which — per design
 * doc §6.5 — auto-applies instead of sitting in the queue. Returns the id
 * of the person the change ultimately touched, for audit_log/revalidation.
 */
async function applyChange(
  supabase: SupabaseClient,
  change: { change_type: PendingChangeType; target_person_id: string | null; proposed_data: Record<string, unknown> },
  actingMemberId: string,
): Promise<string | null> {
  const proposedData = change.proposed_data;

  if (change.change_type === "edit_person") {
    const updatePayload: Record<string, unknown> = { ...proposedData, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("people").update(updatePayload).eq("id", change.target_person_id);
    if (error) throw new Error(error.message);
    return change.target_person_id;
  }

  if (change.change_type === "add_person") {
    const { relation_to_person_id, relation_type, marriage_notes, other_parent_id, parent_gender, ...personFields } =
      proposedData;

    const insertPayload: Record<string, unknown> = { ...personFields };

    if (relation_type === "child" && relation_to_person_id) {
      insertPayload.father_id = parent_gender === "mother" ? other_parent_id ?? null : relation_to_person_id;
      insertPayload.mother_id = parent_gender === "mother" ? relation_to_person_id : other_parent_id ?? null;
    }

    const { data: newPerson, error } = await supabase.from("people").insert(insertPayload).select("id").single();
    if (error) throw new Error(error.message);

    if (relation_type === "parent" && relation_to_person_id) {
      const parentField = parent_gender === "mother" ? "mother_id" : "father_id";
      const { error: linkError } = await supabase
        .from("people")
        .update({ [parentField]: newPerson.id })
        .eq("id", relation_to_person_id as string);
      if (linkError) throw new Error(linkError.message);
    }

    if (relation_type === "spouse" && relation_to_person_id) {
      const { error: spouseError } = await supabase.from("spouses").insert({
        person_a_id: relation_to_person_id,
        person_b_id: newPerson.id,
        marriage_notes: marriage_notes ?? null,
      });
      if (spouseError) throw new Error(spouseError.message);
    }

    return newPerson.id;
  }

  if (change.change_type === "propose_deletion") {
    // Soft delete only — see softDeletePerson in people-admin.ts for why.
    const { error } = await supabase
      .from("people")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actingMemberId })
      .eq("id", change.target_person_id);
    if (error) throw new Error(error.message);
    return change.target_person_id;
  }

  return change.target_person_id;
}

/**
 * If the acting member is an admin, applies the change immediately and
 * logs it as self-approved (design doc §6.5); otherwise inserts a
 * pending_changes row for later review. Returns true if auto-applied.
 */
async function applyOrQueue(
  supabase: SupabaseClient,
  member: Member,
  input: {
    change_type: PendingChangeType;
    target_person_id: string | null;
    proposed_data: Record<string, unknown>;
    previous_data: Record<string, unknown>;
    note: string | null;
  },
): Promise<boolean> {
  if (isAdmin(member)) {
    const appliedPersonId = await applyChange(supabase, input, member.id);
    const { data: insertedChange, error } = await supabase
      .from("pending_changes")
      .insert({
        ...input,
        submitted_by: member.id,
        status: "approved",
        reviewed_by: member.id,
        reviewed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      person_id: appliedPersonId,
      change_type: input.change_type,
      old_value: input.previous_data,
      new_value: input.proposed_data,
      performed_by: member.id,
      submitted_by: member.id,
      pending_change_id: insertedChange.id,
    });
    return true;
  }

  const { error } = await supabase.from("pending_changes").insert({
    ...input,
    submitted_by: member.id,
    status: "pending",
  });
  if (error) throw new Error(error.message);
  await notifyAdminsOfPendingChange();
  return false;
}

export async function submitPersonEdit(formData: FormData) {
  const { supabase, member } = await requireMember();
  const targetPersonId = String(formData.get("person_id") ?? "");
  if (!targetPersonId) throw new Error("Missing person id");

  const { data: current, error: fetchError } = await supabase
    .from("people")
    .select("*")
    .eq("id", targetPersonId)
    .single();
  if (fetchError || !current) throw new Error("Person not found");

  const proposed: Record<string, unknown> = {};
  const previous: Record<string, unknown> = {};

  for (const field of EDITABLE_PERSON_TEXT_FIELDS) {
    if (!formData.has(field)) continue;
    const value = String(formData.get(field) ?? "").trim() || null;
    const currentValue = (current as Person)[field as keyof Person] ?? null;
    if (value !== currentValue) {
      proposed[field] = value;
      previous[field] = currentValue;
    }
  }

  for (const { year, month, day } of EDITABLE_PERSON_DATE_FIELDS) {
    if (!formData.has(year) && !formData.has(month) && !formData.has(day)) continue;
    const parsed = parsePartialDateFields(formData.get(year), formData.get(month), formData.get(day));
    const currentPerson = current as Person;
    if (
      parsed.year !== currentPerson[year as keyof Person] ||
      parsed.month !== currentPerson[month as keyof Person] ||
      parsed.day !== currentPerson[day as keyof Person]
    ) {
      proposed[year] = parsed.year;
      proposed[month] = parsed.month;
      proposed[day] = parsed.day;
      previous[year] = currentPerson[year as keyof Person];
      previous[month] = currentPerson[month as keyof Person];
      previous[day] = currentPerson[day as keyof Person];
    }
  }

  if (Object.keys(proposed).length === 0) {
    throw new Error("No changes to submit");
  }

  await applyOrQueue(supabase, member, {
    change_type: "edit_person",
    target_person_id: targetPersonId,
    proposed_data: proposed,
    previous_data: previous,
    note: String(formData.get("note") ?? "").trim() || null,
  });

  revalidatePath(`/people/${targetPersonId}`);
  revalidatePath("/my-submissions");
  revalidatePath("/admin/pending");
}

export async function submitAddPerson(formData: FormData) {
  const { supabase, member } = await requireMember();

  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!fullName) throw new Error("Full name is required");

  const relationTo = String(formData.get("relation_to_person_id") ?? "").trim() || null;
  const relationType = String(formData.get("relation_type") ?? "").trim();

  const proposed: Record<string, unknown> = {
    full_name: fullName,
    surname_tag: String(formData.get("surname_tag") ?? "").trim() || null,
    living_status: String(formData.get("living_status") ?? "unknown"),
    relation_to_person_id: relationTo,
    relation_type: relationType || null,
    marriage_notes: String(formData.get("marriage_notes") ?? "").trim() || null,
  };

  await applyOrQueue(supabase, member, {
    change_type: "add_person",
    target_person_id: relationTo,
    proposed_data: proposed,
    previous_data: {},
    note: String(formData.get("note") ?? "").trim() || null,
  });

  revalidatePath("/my-submissions");
  revalidatePath("/admin/pending");
  if (relationTo) revalidatePath(`/people/${relationTo}`);
}

export async function approvePendingChange(formData: FormData) {
  const { supabase, member } = await requireAdmin();
  const changeId = String(formData.get("change_id") ?? "");
  if (!changeId) throw new Error("Missing change id");

  const { data: change, error: fetchError } = await supabase
    .from("pending_changes")
    .select("*")
    .eq("id", changeId)
    .single();
  if (fetchError || !change) throw new Error("Change not found");
  if (change.status !== "pending") throw new Error("Already reviewed");

  // Edit-then-approve: any edit_<field> form fields override the
  // submitted values before applying.
  const proposedData: Record<string, unknown> = { ...change.proposed_data };
  for (const key of Object.keys(proposedData)) {
    const override = formData.get(`edit_${key}`);
    if (override !== null) {
      const v = String(override).trim();
      proposedData[key] = v || null;
    }
  }

  const appliedPersonId = await applyChange(
    supabase,
    {
      change_type: change.change_type,
      target_person_id: change.target_person_id,
      proposed_data: proposedData,
    },
    member.id,
  );

  const { error: updateError } = await supabase
    .from("pending_changes")
    .update({
      status: "approved",
      proposed_data: proposedData,
      reviewed_by: member.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", changeId);
  if (updateError) throw new Error(updateError.message);

  await supabase.from("audit_log").insert({
    person_id: appliedPersonId,
    change_type: change.change_type,
    old_value: change.previous_data,
    new_value: proposedData,
    performed_by: member.id,
    submitted_by: change.submitted_by,
    pending_change_id: changeId,
  });

  await notifySubmitterOfDecision();
  revalidatePath("/admin/pending");
  revalidatePath("/my-submissions");
  if (appliedPersonId) revalidatePath(`/people/${appliedPersonId}`);
}

export async function rejectPendingChange(formData: FormData) {
  const { supabase, member } = await requireAdmin();
  const changeId = String(formData.get("change_id") ?? "");
  const adminNote = String(formData.get("admin_note") ?? "").trim() || null;
  if (!changeId) throw new Error("Missing change id");

  const { error } = await supabase
    .from("pending_changes")
    .update({
      status: "rejected",
      admin_note: adminNote,
      reviewed_by: member.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", changeId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  await notifySubmitterOfDecision();
  revalidatePath("/admin/pending");
  revalidatePath("/my-submissions");
}
