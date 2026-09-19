import type { SupabaseClient } from "@supabase/supabase-js";
import { ImportContext, compareShaheenIds, type PersonRow, type SpouseRow, type TempRow } from "@/lib/import-review";

async function loadAll<T>(supabase: SupabaseClient, table: string, columns: string, filter?: (q: any) => any): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(columns);
    if (filter) q = filter(q);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return rows;
}

/** Loads temp_people plus the live people/spouses it's compared against. `migrationNeeded` = the review columns (SQL migration 0018) aren't there yet. */
export async function loadImportContext(supabase: SupabaseClient) {
  const rawTemps = await loadAll<Record<string, unknown>>(supabase, "temp_people", "*");
  const migrationNeeded = rawTemps.length > 0 && !("review_status" in rawTemps[0]);
  const temps: TempRow[] = rawTemps
    .map((r) => ({
      ...(r as unknown as TempRow),
      review_status: ((r.review_status as TempRow["review_status"] | undefined) ?? "pending") as TempRow["review_status"],
      resolved_people_id: (r.resolved_people_id as string | null | undefined) ?? null,
    }))
    .sort((a, b) => compareShaheenIds(a.shaheen_id, b.shaheen_id));

  const people = await loadAll<PersonRow>(
    supabase,
    "people",
    "id, full_name, preferred_name, surname_tag, gender, birth_order, living_status, father_id, mother_id",
    (q) => q.is("deleted_at", null),
  );
  const spouses = await loadAll<SpouseRow>(supabase, "spouses", "person_a_id, person_b_id");
  return { ctx: new ImportContext(temps, people, spouses), migrationNeeded };
}
