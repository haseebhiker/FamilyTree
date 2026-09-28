import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import { Card } from "@/components/ui";
import { FamilyTreeChartTabs } from "@/components/family-tree-chart-tabs";
import { FamilyTreeRootPicker } from "@/components/family-tree-root-picker";
import { displayNameText } from "@/components/person-name";
import {
  loadFamilyTreeData,
  buildFamilyTreeNode,
  collectNodeIds,
  findRelationshipLinks,
  findKinshipLinks,
} from "@/lib/family-tree-data";

// How many generations render at once below whichever person is the
// current root — see FamilyTreeChart's comment for why this is capped.
const VISIBLE_GENERATIONS = 4;

export default async function FamilyTreeChartPage({
  searchParams,
}: {
  searchParams: Promise<{ root?: string }>;
}) {
  const { root: rootParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMember(supabase, user!.id);
  const admin = isAdmin(member);

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

  // Only computed for admins — the extra marriage/blood-relation lines are
  // an admin-only tab on this same chart (see FamilyTreeChartTabs), not
  // something a regular member's page load needs to spend time building.
  const relationshipLinks = admin
    ? (() => {
        const nodeIds = collectNodeIds(chartRoot);
        return [...findRelationshipLinks(nodeIds, data.spousesById), ...findKinshipLinks(nodeIds, data.spousesById, data.peopleById)];
      })()
    : undefined;

  const father = rootPerson.father_id ? data.peopleById.get(rootPerson.father_id) : null;
  const mother = rootPerson.mother_id ? data.peopleById.get(rootPerson.mother_id) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-sm font-medium text-slate-600">
        <Link href="/tree" className="hover:text-slate-900">
          List
        </Link>
        <span className="text-slate-900">Chart</span>
        <Link href="/tree/surnames" className="hover:text-slate-900">
          Surnames
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-slate-900">Tree</h1>
        <p className="mt-1 text-sm text-slate-500">
          A visual, connector-line view of the tree, {VISIBLE_GENERATIONS} generations at a time. Click any name to
          re-center the chart on them and reveal further generations.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        {(father || mother) ? (
          <p className="text-sm text-slate-500">
            Up:{" "}
            {father && (
              <Link href={`/tree/chart?root=${father.id}`} className="text-blue-600 hover:underline">
                {displayNameText(father)}
              </Link>
            )}
            {father && mother && <span className="mx-1">·</span>}
            {mother && (
              <Link href={`/tree/chart?root=${mother.id}`} className="text-blue-600 hover:underline">
                {displayNameText(mother)}
              </Link>
            )}
          </p>
        ) : (
          <span />
        )}
        <FamilyTreeRootPicker people={data.allPeople} />
      </div>

      <FamilyTreeChartTabs root={chartRoot} relationshipLinks={relationshipLinks} basePath="/tree/chart" />
    </div>
  );
}
