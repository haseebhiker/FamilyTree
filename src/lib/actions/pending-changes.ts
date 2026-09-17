"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import type { Member, Person, PendingChangeType } from "@/lib/types";
import { parsePartialDateFields } from "@/lib/partial-date";
import { encryptValue } from "@/lib/vault-crypto";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { sendEmail, emailBodyToHtml } from "@/lib/email";
import { notifyAdmins } from "@/lib/notify-admins";

const RELATION_MAP: Record<string, { type: "child" | "parent" | "sibling" | "spouse"; gender: "M" | "F" }> = {
  father: { type: "parent", gender: "M" },
  mother: { type: "parent", gender: "F" },
  son: { type: "child", gender: "M" },
  daughter: { type: "child", gender: "F" },
  brother: { type: "sibling", gender: "M" },
  sister: { type: "sibling", gender: "F" },
  husband: { type: "spouse", gender: "M" },
  wife: { type: "spouse", gender: "F" },
};

// photo_url isn't in here anymore — it's set directly by updatePersonPhoto
// after a real upload (see person-photo-upload.tsx), not hand-typed.
const URL_FIELDS = new Set(["facebook_url", "linkedin_url"]);

const EDITABLE_PERSON_TEXT_FIELDS = [
  "full_name",
  "preferred_name",
  "other_names",
  "surname_tag",
  "gender",
  "living_status",
  "place_of_birth",
  "place_of_death",
  "current_location",
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

async function notifyAdminsOfPendingChange(
  supabase: SupabaseClient,
  submitterName: string,
  changeType: PendingChangeType,
  targetPersonId: string | null,
) {
  const { data: person } = targetPersonId
    ? await supabase.from("people").select("full_name, preferred_name").eq("id", targetPersonId).maybeSingle()
    : { data: null };
  const personName = person ? person.preferred_name?.trim() || person.full_name : "the family tree";

  await notifyAdmins(
    "Something's waiting for approval on Family Tree",
    `${submitterName} submitted a change (${changeType.replace(/_/g, " ")}) for ${personName}.\n\nReview it at https://familytree.haseeb.in/admin/pending`,
  );
}

/**
 * Tells whoever submitted a change whether it was approved or rejected —
 * best-effort, same as every other email in this app (a failed/unconfigured
 * send should never undo a decision that already succeeded).
 */
async function notifySubmitterOfDecision(
  supabase: SupabaseClient,
  submittedBy: string,
  decision: "approved" | "rejected",
  targetPersonId: string | null,
  adminNote: string | null,
) {
  const { data: submitter } = await supabase.from("members").select("name, email").eq("id", submittedBy).maybeSingle();
  if (!submitter) return;

  const { data: person } = targetPersonId
    ? await supabase.from("people").select("full_name, preferred_name").eq("id", targetPersonId).maybeSingle()
    : { data: null };
  const personName = person ? person.preferred_name?.trim() || person.full_name : "someone in the tree";

  const body =
    decision === "approved"
      ? `Hi ${submitter.name},\n\nGood news — the change you submitted for ${personName} has been approved and is now live on the family tree. Thanks for keeping it accurate!\n\nSee it at https://familytree.haseeb.in`
      : `Hi ${submitter.name},\n\nThe change you submitted for ${personName} wasn't approved.${adminNote ? ` Note from the admin: ${adminNote}` : ""}\n\nIf you have questions, feel free to ask whoever reviewed it. You can see all your submissions at https://familytree.haseeb.in/my-submissions`;

  await sendEmail({
    to: submitter.email,
    subject: decision === "approved" ? "Your Family Tree submission was approved" : "Your Family Tree submission wasn't approved",
    html: emailBodyToHtml(body),
  });
}

/**
 * Which slot (father_id/mother_id) `personId` should fill as a NEW child's
 * parent — this is about `personId`'s OWN gender, never the new child's.
 * Prefers the recorded `gender` column; falls back to inferring it from
 * where else `personId` already appears (as someone's father_id/mother_id,
 * or as a spouse of someone whose own gender is known) before giving up.
 */
async function resolveParentGender(supabase: SupabaseClient, personId: string): Promise<"father" | "mother" | null> {
  const { data: person } = await supabase.from("people").select("gender").eq("id", personId).maybeSingle();
  if (person?.gender === "M") return "father";
  if (person?.gender === "F") return "mother";

  const { count: asFather } = await supabase
    .from("people")
    .select("id", { count: "exact", head: true })
    .eq("father_id", personId);
  if ((asFather ?? 0) > 0) return "father";
  const { count: asMother } = await supabase
    .from("people")
    .select("id", { count: "exact", head: true })
    .eq("mother_id", personId);
  if ((asMother ?? 0) > 0) return "mother";

  const { data: spouseRow } = await supabase
    .from("spouses")
    .select("person_a_id, person_b_id")
    .or(`person_a_id.eq.${personId},person_b_id.eq.${personId}`)
    .limit(1)
    .maybeSingle();
  if (spouseRow) {
    const spouseId = spouseRow.person_a_id === personId ? spouseRow.person_b_id : spouseRow.person_a_id;
    const { data: spouse } = await supabase.from("people").select("gender").eq("id", spouseId).maybeSingle();
    if (spouse?.gender === "M") return "mother";
    if (spouse?.gender === "F") return "father";
  }

  return null;
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
    const {
      relation_to_person_id,
      relation_type,
      marriage_notes,
      other_parent_id,
      parent_gender,
      pending_phone_country,
      pending_phone_number,
      pending_email,
      ...personFields
    } = proposedData;

    const insertPayload: Record<string, unknown> = { ...personFields };

    if (relation_type === "child" && relation_to_person_id) {
      // `parent_gender` in proposed_data reflects the RELATION picked at
      // submission time (e.g. "daughter"), which is the new child's own
      // gender, not relation_to_person_id's — using it directly would file
      // a father under mother_id any time someone adds a daughter to his
      // profile. Resolve relation_to_person_id's actual gender fresh here
      // instead, falling back to the submitted value only if that's
      // genuinely undeterminable.
      const resolvedGender = (await resolveParentGender(supabase, relation_to_person_id as string)) ?? parent_gender;
      insertPayload.father_id = resolvedGender === "mother" ? other_parent_id ?? null : relation_to_person_id;
      insertPayload.mother_id = resolvedGender === "mother" ? relation_to_person_id : other_parent_id ?? null;
    }

    if (relation_type === "sibling" && relation_to_person_id) {
      // A new sibling shares whatever parents are already on record for
      // the person they're being added relative to.
      const { data: sourcePerson } = await supabase
        .from("people")
        .select("father_id, mother_id")
        .eq("id", relation_to_person_id as string)
        .single();
      if (sourcePerson?.father_id) insertPayload.father_id = sourcePerson.father_id;
      if (sourcePerson?.mother_id) insertPayload.mother_id = sourcePerson.mother_id;
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

    // Optional contact details captured inline while adding the person —
    // silently skipped rather than blocking the whole submission if the
    // phone number doesn't validate; they can always add/fix it later
    // from the new profile itself.
    if (pending_phone_number) {
      const parsedPhone = parsePhoneNumberFromString(
        pending_phone_number as string,
        (pending_phone_country as string | undefined) as CountryCode | undefined,
      );
      if (parsedPhone?.isValid()) {
        await supabase.from("contact_details").insert({
          person_id: newPerson.id,
          contact_type: "phone",
          label: "Mobile",
          value: encryptValue(parsedPhone.number),
          visibility: "everyone",
        });
      }
    }
    if (pending_email) {
      await supabase.from("contact_details").insert({
        person_id: newPerson.id,
        contact_type: "email",
        label: "Personal",
        value: encryptValue(pending_email as string),
        visibility: "everyone",
      });
    }

    return newPerson.id;
  }

  if (change.change_type === "add_relationship") {
    const { existing_person_id, parent_gender, mode, relation_to_person_id, marriage_notes } = proposedData;

    if (mode === "sibling") {
      // target_person_id is the (existing) person being made a sibling —
      // give them the same parents already on record for relation_to_person_id.
      const { data: sourcePerson } = await supabase
        .from("people")
        .select("father_id, mother_id")
        .eq("id", relation_to_person_id as string)
        .single();
      const updatePayload: Record<string, unknown> = {};
      if (sourcePerson?.father_id) updatePayload.father_id = sourcePerson.father_id;
      if (sourcePerson?.mother_id) updatePayload.mother_id = sourcePerson.mother_id;
      if (Object.keys(updatePayload).length === 0) throw new Error("That person has no recorded parents to share");
      const { error } = await supabase.from("people").update(updatePayload).eq("id", change.target_person_id);
      if (error) throw new Error(error.message);
      return change.target_person_id;
    }

    if (mode === "spouse") {
      const { error } = await supabase.from("spouses").insert({
        person_a_id: relation_to_person_id,
        person_b_id: existing_person_id,
        marriage_notes: marriage_notes ?? null,
      });
      if (error) throw new Error(error.message);
      return change.target_person_id;
    }

    // The correct slot always tracks existing_person_id's OWN gender (the
    // person actually being written into father_id/mother_id) — resolve it
    // fresh rather than trusting parent_gender, which for the "add this
    // existing person as a child" shape was computed from the CHILD's
    // gender at submission time, not the parent being linked.
    const resolvedGender = (await resolveParentGender(supabase, existing_person_id as string)) ?? parent_gender;
    const parentField = resolvedGender === "mother" ? "mother_id" : "father_id";
    const { error } = await supabase
      .from("people")
      .update({ [parentField]: existing_person_id })
      .eq("id", change.target_person_id);
    if (error) throw new Error(error.message);
    return change.target_person_id;
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
 * Backend guard against the exact shape of duplicate that a form double-tap
 * or a network retry produces: the same member submitting the same
 * add-a-relative request, or the same edit, for the same target person
 * again within a short window. Not checked for propose_deletion, where a
 * second identical request isn't really a "duplicate" in a harmful sense.
 * Checked regardless of the earlier submission's status (pending, approved,
 * or rejected) since a double-tap duplicate lands with the same status as
 * the one that beat it there either way.
 */
async function isRecentDuplicate(
  supabase: SupabaseClient,
  member: Member,
  input: { change_type: PendingChangeType; target_person_id: string | null; proposed_data: Record<string, unknown> },
): Promise<boolean> {
  if (input.change_type === "propose_deletion") return false;
  let identityFields: Record<string, unknown> = {};
  if (input.change_type === "edit_person") {
    // The whole proposed_data *is* the identity here — two edits are "the
    // same" exactly when they propose the same field values.
    identityFields = input.proposed_data;
    if (Object.keys(identityFields).length === 0) return false;
  } else {
    for (const key of ["relation_to_person_id", "existing_person_id", "full_name", "relation_type", "mode"]) {
      if (input.proposed_data[key] !== undefined) identityFields[key] = input.proposed_data[key];
    }
  }
  const { data } = await supabase
    .from("pending_changes")
    .select("id")
    .eq("change_type", input.change_type)
    .eq("target_person_id", input.target_person_id)
    .eq("submitted_by", member.id)
    .contains("proposed_data", identityFields)
    .gte("created_at", new Date(Date.now() - 5 * 60000).toISOString())
    .limit(1);
  return (data?.length ?? 0) > 0;
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
  if (await isRecentDuplicate(supabase, member, input)) return false;

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
  await notifyAdminsOfPendingChange(supabase, member.name, input.change_type, input.target_person_id);
  return false;
}

/**
 * `skipRevalidate` is for Quick Edit, which calls this repeatedly and
 * rapidly (every field, on blur, across many people in one sitting) while
 * managing its own state entirely client-side — it never needed the
 * revalidated page data this function normally triggers. That revalidation
 * is also the same class of thing already root-caused once this session as
 * the source of a generic React render error surfacing from a Server
 * Action's background re-render; skipping it here removes that surface
 * entirely for the one caller hammering this function fast enough to make
 * it likely, without changing behavior for the normal single-submit case
 * (EditPersonForm), which still wants the revalidation.
 */
export async function submitPersonEdit(formData: FormData, options?: { skipRevalidate?: boolean }): Promise<boolean> {
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
    if (field === "full_name" && !value) {
      throw new Error("Full name can't be blank.");
    }
    if (value && URL_FIELDS.has(field) && !/^https?:\/\//i.test(value)) {
      throw new Error(`${field.replace(/_/g, " ")} needs to be a link starting with https:// — not a name or plain text.`);
    }
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

  // Not a date field — a plain fallback rank ("2nd child") consulted only
  // when birth_year is missing entirely, see src/lib/sort-by-age.ts.
  if (formData.has("birth_order")) {
    const raw = String(formData.get("birth_order") ?? "").trim();
    const parsedOrder = raw ? Number.parseInt(raw, 10) : NaN;
    const value = Number.isInteger(parsedOrder) && parsedOrder > 0 ? parsedOrder : null;
    const currentValue = (current as Person).birth_order ?? null;
    if (value !== currentValue) {
      proposed.birth_order = value;
      previous.birth_order = currentValue;
    }
  }

  // Nothing actually changed — most often a double-tap on Save while the
  // first submission was still in flight, or tapping it again afterward
  // just to make sure it "took." Treat it as an already-successful no-op
  // rather than an error: there's nothing wrong with the data, it's just
  // already exactly what was submitted.
  if (Object.keys(proposed).length === 0) {
    return true;
  }

  const applied = await applyOrQueue(supabase, member, {
    change_type: "edit_person",
    target_person_id: targetPersonId,
    proposed_data: proposed,
    previous_data: previous,
    note: String(formData.get("note") ?? "").trim() || null,
  });

  if (!options?.skipRevalidate) {
    revalidatePath(`/people/${targetPersonId}`);
    revalidatePath("/my-submissions");
    revalidatePath("/admin/pending");
  }

  return applied;
}

/**
 * Single entry point for "Add a family member" — one relation dropdown
 * (Father/Mother/Son/Daughter/Brother/Sister/Husband/Wife, so gender is
 * implied by the choice instead of asked separately) followed by either
 * picking an existing person or filling in a new one, replacing what used
 * to be four separate always-visible forms. Direction of the underlying
 * add_relationship update flips depending on the relation's type: adding
 * an existing "parent" sets *this* person's parent field, while adding an
 * existing "child" sets the *other* person's parent field to point back
 * at this one — same primitive, just aimed at whichever side needs it.
 */
export async function submitFamilyRelation(formData: FormData) {
  const { supabase, member } = await requireMember();

  const personId = String(formData.get("person_id") ?? "").trim();
  const relation = String(formData.get("relation") ?? "").trim();
  const mode = String(formData.get("mode") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;

  const mapped = RELATION_MAP[relation];
  if (!personId) throw new Error("Missing person id");
  if (!mapped) throw new Error("Invalid relation");
  if (!["new", "existing"].includes(mode)) throw new Error("Invalid mode");

  const relationType = mapped.type;
  const parentGender = mapped.gender === "M" ? "father" : "mother";

  const revalidateIds = new Set<string>([personId]);

  if (mode === "existing") {
    const existingPersonId = String(formData.get("existing_person_id") ?? "").trim();
    if (!existingPersonId) throw new Error("Choose a person");
    if (existingPersonId === personId) throw new Error("A person can't be related to themselves");
    revalidateIds.add(existingPersonId);

    if (relationType === "parent") {
      await applyOrQueue(supabase, member, {
        change_type: "add_relationship",
        target_person_id: personId,
        proposed_data: { relation_to_person_id: personId, existing_person_id: existingPersonId, parent_gender: parentGender },
        previous_data: {},
        note,
      });
    } else if (relationType === "child") {
      await applyOrQueue(supabase, member, {
        change_type: "add_relationship",
        target_person_id: existingPersonId,
        proposed_data: { relation_to_person_id: existingPersonId, existing_person_id: personId, parent_gender: parentGender },
        previous_data: {},
        note,
      });
    } else if (relationType === "sibling") {
      await applyOrQueue(supabase, member, {
        change_type: "add_relationship",
        target_person_id: existingPersonId,
        proposed_data: { relation_to_person_id: personId, mode: "sibling" },
        previous_data: {},
        note,
      });
    } else {
      await applyOrQueue(supabase, member, {
        change_type: "add_relationship",
        target_person_id: personId,
        proposed_data: {
          relation_to_person_id: personId,
          existing_person_id: existingPersonId,
          mode: "spouse",
          marriage_notes: String(formData.get("marriage_notes") ?? "").trim() || null,
        },
        previous_data: {},
        note,
      });
    }
  } else {
    const fullName = String(formData.get("full_name") ?? "").trim();
    if (!fullName) throw new Error("Full name is required");

    const birthDate = parsePartialDateFields(
      formData.get("birth_year"),
      formData.get("birth_month"),
      formData.get("birth_day"),
    );
    const birthOrderRaw = String(formData.get("birth_order") ?? "").trim();
    const birthOrderParsed = birthOrderRaw ? Number.parseInt(birthOrderRaw, 10) : NaN;
    const birthOrder = Number.isInteger(birthOrderParsed) && birthOrderParsed > 0 ? birthOrderParsed : null;

    const proposed: Record<string, unknown> = {
      full_name: fullName,
      surname_tag: String(formData.get("surname_tag") ?? "").trim() || null,
      gender: mapped.gender,
      living_status: String(formData.get("living_status") ?? "unknown"),
      birth_year: birthDate.year,
      birth_month: birthDate.month,
      birth_day: birthDate.day,
      birth_order: birthOrder,
      relation_to_person_id: personId,
      relation_type: relationType,
      parent_gender: parentGender,
      marriage_notes: relationType === "spouse" ? String(formData.get("marriage_notes") ?? "").trim() || null : null,
      pending_phone_country: String(formData.get("phone_country") ?? "").trim() || null,
      pending_phone_number: String(formData.get("phone_number") ?? "").trim() || null,
      pending_email: String(formData.get("email") ?? "").trim() || null,
    };

    await applyOrQueue(supabase, member, {
      change_type: "add_person",
      target_person_id: personId,
      proposed_data: proposed,
      previous_data: {},
      note,
    });
  }

  revalidatePath("/my-submissions");
  revalidatePath("/admin/pending");
  for (const id of revalidateIds) revalidatePath(`/people/${id}`);
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

  await notifySubmitterOfDecision(supabase, change.submitted_by, "approved", appliedPersonId, null);
  // No revalidatePath — called from PendingChangeApproveForm/
  // PendingChangeApproveRaw, which do their own router.refresh() after
  // success. See ActionButton's comment for why bundling a revalidatePath
  // re-render into the action's own response was the repeated source of
  // #441 crashes this session.
}

export async function rejectPendingChange(formData: FormData) {
  const { supabase, member } = await requireAdmin();
  const changeId = String(formData.get("change_id") ?? "");
  const adminNote = String(formData.get("admin_note") ?? "").trim() || null;
  if (!changeId) throw new Error("Missing change id");

  const { data: change, error: fetchError } = await supabase
    .from("pending_changes")
    .select("submitted_by, target_person_id")
    .eq("id", changeId)
    .single();
  if (fetchError || !change) throw new Error("Change not found");

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

  await notifySubmitterOfDecision(supabase, change.submitted_by, "rejected", change.target_person_id, adminNote);
  // No revalidatePath — see approvePendingChange's comment just above.
}
