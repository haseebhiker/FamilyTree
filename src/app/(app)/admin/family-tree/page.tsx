import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { FamilyTreeChart } from "@/components/family-tree-chart";
import { FamilyTreeRootPicker } from "@/components/family-tree-root-picker";
import { displayNameText } from "@/components/person-name";
import { loadFamilyTreeData, buildFamilyTreeNode, collectNodeIds, findCrossLinks } from "@/lib/family-tree-data";

// Same chart as the member-facing /tree/chart (see that page and
// FamilyTreeChart's own comment for why generations are capped this way),
// plus cross-relation lines — an admin-only view, so this is a separate
// route rather than a toggle on the member page.
const VISIBLE_GENERATIONS = 4;
const BASE_PATH = "/admin/family-tree";

export default async function AdminFamilyTreeChartPage({
  searchParams,
}: {
  searchParams: Promise<{ root?: string }>;
}) {
  const { root: rootParam } = await searchParams;
  const supabase = await createClient();
  const data = await loadFamilyTreeData(supabase);

  if (data.allPeople.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500">
          No one&apos;s in the tree yet. Once the legacy data is imported, it&apos;ll show up here.
        </p>
      </Card>
    );
  }

  const rootPerson = (rootParam && data.peopleById.get(rootParam)) || data.defaultRoot;
  if (!rootPerson) {
    return (
      <Card>
        <p className="text-sm text-slate-500">No one&apos;s in the tree yet.</p>
      </Card>
    );
  }

  const chartRoot = buildFamilyTreeNode(rootPerson.id, VISIBLE_GENERATIONS - 1, data);
  const nodeIds = collectNodeIds(chartRoot);
  const crossLinks = findCrossLinks(nodeIds, data.spouseIdsById);
  const father = rootPerson.father_id ? data.peopleById.get(rootPerson.father_id) : null;
  const mother = rootPerson.mother_id ? data.peopleById.get(rootPerson.mother_id) : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Family Tree Chart (Admin)</h1>
        <p className="mt-1 text-sm text-slate-500">
          Same as the member-facing{" "}
          <Link href="/tree/chart" className="text-blue-600 hover:underline">
            Tree
          </Link>
          , {VISIBLE_GENERATIONS} generations at a time, plus{" "}
          <span className="font-medium text-red-600">dashed red lines</span> connecting anyone (or their spouse) who
          also shows up elsewhere in this chart as a blood relative — i.e. a marriage within the family, not to
          someone who married in from outside. Admin-only for now.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        {(father || mother) ? (
          <p className="text-sm text-slate-500">
            Up:{" "}
            {father && (
              <Link href={`${BASE_PATH}?root=${father.id}`} className="text-blue-600 hover:underline">
                {displayNameText(father)}
              </Link>
            )}
            {father && mother && <span className="mx-1">·</span>}
            {mother && (
              <Link href={`${BASE_PATH}?root=${mother.id}`} className="text-blue-600 hover:underline">
                {displayNameText(mother)}
              </Link>
            )}
          </p>
        ) : (
          <span />
        )}
        <FamilyTreeRootPicker people={data.allPeople} basePath={BASE_PATH} />
      </div>

      {crossLinks.length > 0 && (
        <p className="text-xs text-slate-400">
          {crossLinks.length} {crossLinks.length === 1 ? "marriage" : "marriages"} within the family highlighted in
          this view.
        </p>
      )}

      <FamilyTreeChart root={chartRoot} crossLinks={crossLinks} basePath={BASE_PATH} />
    </div>
  );
}
