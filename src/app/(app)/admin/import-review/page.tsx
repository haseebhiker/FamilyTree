import { createClient } from "@/lib/supabase/server";
import { loadImportContext } from "@/lib/import-review-load";
import { ImportReviewList } from "@/components/import-review-list";

export default async function ImportReviewPage() {
  const supabase = await createClient();
  const { ctx, migrationNeeded } = await loadImportContext(supabase);
  const rows = ctx.temps.map((t) => ctx.view(t));
  const people = ctx.people.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    preferred_name: p.preferred_name,
    surname_tag: p.surname_tag,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Import Review</h1>
        <p className="mt-1 text-sm text-slate-500">
          People from the staging table, checked against the tree. Matches show side by side with differences
          highlighted; people not in the tree can be approved one at a time, parents first. Nothing changes until you
          press a button.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No rows are visible in temp_people. If the table has data, run the SQL for migration 0018 (it lets admins
          read it).
        </p>
      ) : (
        <ImportReviewList rows={rows} people={people} migrationNeeded={migrationNeeded} />
      )}
    </div>
  );
}
