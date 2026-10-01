import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { FamilyTreeChart } from "@/components/family-tree-chart";
import { FamilyTreeRootPicker } from "@/components/family-tree-root-picker";
import { TreeSubnav } from "@/components/tree-subnav";
import { displayNameText } from "@/components/person-name";
import {
  loadFamilyTreeData,
  buildFamilyTreeNode,
  collectNodeIds,
  findRelationshipLinks,
  findKinshipLinks,
} from "@/lib/family-tree-data";

// Same chart as /tree/chart (see that page and FamilyTreeChart's own
// comment for why generations are capped this way), plus lines for
// marriages and in-law blood ties the plain chart doesn't show.
const VISIBLE_GENERATIONS = 4;
const BASE_PATH = "/tree/relationships";

export default async function TreeRelationshipsPage({
  searchParams,
}: {
  searchParams: Promise<{ root?: string; depth?: string }>;
}) {
  const { root: rootParam, depth } = await searchParams;
  const showAll = depth === "all";
  const extraQuery = showAll ? "&depth=all" : "";
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

  const chartRoot = buildFamilyTreeNode(rootPerson.id, showAll ? Infinity : VISIBLE_GENERATIONS - 1, data);
  const nodeIds = collectNodeIds(chartRoot);
  const relationshipLinks = [
    ...findRelationshipLinks(nodeIds, data.spousesById),
    ...findKinshipLinks(nodeIds, data.spousesById, data.peopleById),
  ];
  const crossCount = relationshipLinks.filter((l) => l.kind === "cross").length;
  const kinshipCount = relationshipLinks.filter((l) => l.kind === "kinship").length;
  const marriageCount = relationshipLinks.length - crossCount - kinshipCount;
  const father = rootPerson.father_id ? data.peopleById.get(rootPerson.father_id) : null;
  const mother = rootPerson.mother_id ? data.peopleById.get(rootPerson.mother_id) : null;

  return (
    <div className="space-y-4">
      <TreeSubnav active="relationships" />

      <div>
        <h1 className="text-xl font-semibold text-slate-900">Relationship Lines</h1>
        <p className="mt-1 text-sm text-slate-500">
          Same chart as <Link href="/tree/chart" className="text-blue-600 hover:underline">Tree</Link>, plus lines
          for marriages and in-law blood ties the tree structure alone doesn&apos;t show:{" "}
          <span className="font-medium text-cyan-700">teal</span> for an ordinary marriage,{" "}
          <span className="font-medium text-red-600">dashed red</span> when both spouses also show up elsewhere in
          this chart as blood relatives (a marriage within the family), and{" "}
          <span className="font-medium text-amber-700">dashed amber</span> between two in-law spouses — married to
          different people in this family — who turn out to be related to each other (e.g. sisters).
        </p>
      </div>

      <div className="flex items-center gap-1 text-sm">
        <span className="mr-1 text-slate-500">Show:</span>
        {[
          { label: `${VISIBLE_GENERATIONS} generations`, all: false },
          { label: "All generations", all: true },
        ].map((opt) =>
          opt.all === showAll ? (
            <span key={opt.label} className="rounded-md bg-slate-900 px-2.5 py-1 font-medium text-white">
              {opt.label}
            </span>
          ) : (
            <Link
              key={opt.label}
              href={`${BASE_PATH}?root=${rootPerson.id}${opt.all ? "&depth=all" : ""}`}
              className="rounded-md border border-slate-300 px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-50"
            >
              {opt.label}
            </Link>
          ),
        )}
        {showAll && (
          <span className="ml-2 text-xs text-slate-400">Large — zoom out (−) to see the whole thing.</span>
        )}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        {(father || mother) ? (
          <p className="text-sm text-slate-500">
            Up:{" "}
            {father && (
              <Link href={`${BASE_PATH}?root=${father.id}${extraQuery}`} className="text-blue-600 hover:underline">
                {displayNameText(father)}
              </Link>
            )}
            {father && mother && <span className="mx-1">·</span>}
            {mother && (
              <Link href={`${BASE_PATH}?root=${mother.id}${extraQuery}`} className="text-blue-600 hover:underline">
                {displayNameText(mother)}
              </Link>
            )}
          </p>
        ) : (
          <span />
        )}
        <FamilyTreeRootPicker people={data.allPeople} basePath={BASE_PATH} extraQuery={extraQuery} />
      </div>

      {relationshipLinks.length > 0 && (
        <p className="text-xs text-slate-400">
          {[
            marriageCount > 0 && `${marriageCount} ordinary ${marriageCount === 1 ? "marriage" : "marriages"}`,
            crossCount > 0 && `${crossCount} within-family ${crossCount === 1 ? "marriage" : "marriages"}`,
            kinshipCount > 0 && `${kinshipCount} in-law ${kinshipCount === 1 ? "tie" : "ties"}`,
          ]
            .filter(Boolean)
            .join(", ")}{" "}
          shown in this view.
        </p>
      )}

      <FamilyTreeChart
        root={chartRoot}
        relationshipLinks={relationshipLinks}
        basePath={BASE_PATH}
        extraQuery={extraQuery}
      />
    </div>
  );
}
