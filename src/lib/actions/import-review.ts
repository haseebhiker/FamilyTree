"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import { loadImportContext } from "@/lib/import-review-load";
import type { TempRow } from "@/lib/import-review";

type Result = { ok: true } | { error: string };

/**
 * Every action here returns { error } instead of throwing — a thrown Server
 * Action error reaches the browser as a stripped "Minified React error
 * #441" in production. Each action works on ONE staging row at a time and
 * re-derives everything (parents, differences) from the database rather
 * than trusting what the page sent.
 */
async function withAdmin(fn: (supabase: SupabaseClient, memberId: string) => Promise<Result>): Promise<Result> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not signed in" };
    const member = await getCurrentMember(supabase, user.id);
    if (!member || !isAdmin(member)) return { error: "Admins only" };
    return await fn(supabase, member.id);
  } catch (e) {
    console.error("[import-review]", e);
    return { error: e instanceof Error ? e.message : "Something went wrong — please try again." };
  }
}

async function markTemp(supabase: SupabaseClient, shaheenId: string, patch: Record<string, unknown>): Promise<Result> {
  const { error } = await supabase.from("temp_people").update(patch).eq("shaheen_id", shaheenId);
  return error ? { error: `Couldn't update the staging row: ${error.message}` } : { ok: true };
}

function requirePendingRow(row: TempRow | undefined): TempRow {
  if (!row) throw new Error("That row no longer exists");
  if (row.review_status !== "pending") throw new Error("That row was already handled — reload the page");
  return row;
}

/** The match is right. Optionally also copies chosen fields (name / birth order / living status) from the source onto the person. */
export async function confirmTempMatch(shaheenId: string, fields: string[]): Promise<Result> {
  return withAdmin(async (supabase, memberId) => {
    const { ctx } = await loadImportContext(supabase);
    const row = requirePendingRow(ctx.tempById.get(shaheenId));
    const person = row.matched_people_id ? ctx.personById.get(row.matched_people_id) : undefined;
    if (!person) return { error: "There's no matched person to confirm" };

    const wanted = ctx.diffs(row, person).filter((d) => fields.includes(d.field));
    if (wanted.length > 0) {
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const d of wanted) {
        before[d.field] = person[d.field];
        after[d.field] = d.field === "birth_order" ? row.birth_order : d.field === "living_status" ? row.living_status : row.full_name;
      }
      const { error } = await supabase
        .from("people")
        .update({ ...after, updated_at: new Date().toISOString() })
        .eq("id", person.id);
      if (error) return { error: error.message };
      await supabase.from("audit_log").insert({
        person_id: person.id,
        change_type: "edit_person",
        old_value: before,
        new_value: after,
        performed_by: memberId,
        submitted_by: memberId,
        note: `Import review (source row ${shaheenId})`,
      });
    }
    return markTemp(supabase, shaheenId, {
      review_status: "confirmed",
      resolved_people_id: person.id,
      reviewed_at: new Date().toISOString(),
    });
  });
}

/** Point a source row at a different existing person (or the same suggestion the search found). Needs confirming afterwards. */
export async function rematchTempPerson(shaheenId: string, personId: string): Promise<Result> {
  return withAdmin(async (supabase) => {
    const { ctx } = await loadImportContext(supabase);
    requirePendingRow(ctx.tempById.get(shaheenId));
    if (!ctx.personById.has(personId)) return { error: "That person isn't in the tree" };
    return markTemp(supabase, shaheenId, { matched_people_id: personId, match_status: "POTENTIAL_MATCH" });
  });
}

/** The suggested match is wrong — treat this row as someone not in the tree yet. */
export async function unmatchTempPerson(shaheenId: string): Promise<Result> {
  return withAdmin(async (supabase) => {
    const { ctx } = await loadImportContext(supabase);
    requirePendingRow(ctx.tempById.get(shaheenId));
    return markTemp(supabase, shaheenId, { matched_people_id: null, match_status: "MISSING" });
  });
}

export async function skipTempPerson(shaheenId: string, skip: boolean): Promise<Result> {
  return withAdmin(async (supabase) => {
    const { ctx } = await loadImportContext(supabase);
    const row = ctx.tempById.get(shaheenId);
    if (!row) return { error: "That row no longer exists" };
    if (skip && row.review_status !== "pending") return { error: "That row was already handled — reload the page" };
    if (!skip && row.review_status !== "skipped") return { error: "That row isn't skipped" };
    return markTemp(supabase, shaheenId, {
      review_status: skip ? "skipped" : "pending",
      reviewed_at: skip ? new Date().toISOString() : null,
    });
  });
}

/** Approve adding a not-in-tree row as a new person, linked to their parents; optionally also adds the source's spouse as a new person and links them. */
export async function addTempPerson(shaheenId: string, addSpouse: boolean): Promise<Result> {
  return withAdmin(async (supabase, memberId) => {
    const { ctx } = await loadImportContext(supabase);
    const row = requirePendingRow(ctx.tempById.get(shaheenId));
    if (row.matched_people_id) return { error: "This row has a match — confirm it instead of adding a duplicate" };
    const plan = ctx.addPlan(row);
    if (!plan.ready) return { error: plan.blocker ?? "Can't add this yet" };

    const living = row.living_status === "living" || row.living_status === "deceased" ? row.living_status : "unknown";
    const newPersonFields = {
      full_name: row.full_name.trim(),
      birth_order: row.birth_order,
      living_status: living,
      gender: plan.gender,
      father_id: plan.fatherId,
      mother_id: plan.motherId,
    };
    const { data: created, error } = await supabase.from("people").insert(newPersonFields).select("id").single();
    if (error) return { error: error.message };
    await supabase.from("audit_log").insert({
      person_id: created.id,
      change_type: "add_person",
      old_value: null,
      new_value: newPersonFields,
      performed_by: memberId,
      submitted_by: memberId,
      note: `Import review (source row ${shaheenId})`,
    });

    if (addSpouse && row.spouse_name) {
      const spouseFields = {
        full_name: row.spouse_name.trim(),
        living_status: "unknown",
        gender: plan.gender === "M" ? "F" : plan.gender === "F" ? "M" : null,
      };
      const { data: spouse, error: spouseError } = await supabase.from("people").insert(spouseFields).select("id").single();
      if (spouseError) return { error: `Added ${row.full_name}, but couldn't add spouse: ${spouseError.message}` };
      const { error: linkError } = await supabase
        .from("spouses")
        .insert({ person_a_id: created.id, person_b_id: spouse.id });
      if (linkError) return { error: `Added ${row.full_name} and spouse, but couldn't link them: ${linkError.message}` };
      await supabase.from("audit_log").insert({
        person_id: spouse.id,
        change_type: "add_person",
        old_value: null,
        new_value: spouseFields,
        performed_by: memberId,
        submitted_by: memberId,
        note: `Import review (spouse of source row ${shaheenId})`,
      });
    }

    return markTemp(supabase, shaheenId, {
      review_status: "added",
      resolved_people_id: created.id,
      reviewed_at: new Date().toISOString(),
    });
  });
}
