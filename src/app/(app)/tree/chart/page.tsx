import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { FamilyTreeChart, type FamilyTreeNode } from "@/components/family-tree-chart";
import { FamilyTreeRootPicker } from "@/components/family-tree-root-picker";
import { displayNameText } from "@/components/person-name";
import { sortSiblings } from "@/lib/sort-by-age";

// How many generations render at once below whichever person is the
// current root — kept small on purpose (see FamilyTreeChart's comment):
// the full tree is 1,000+ people, so a fixed depth plus "+N more" links to
// re-root deeper is what keeps this a chart instead of the whole tree
// dumped in the DOM.
const VISIBLE_GENERATIONS = 4;

interface PersonRow {
  id: string;
  public_no: number | null;
  full_name: string;
  preferred_name: string | null;
  surname_tag: string | null;
  living_status: string;
  father_id: string | null;
  mother_id: string | null;
  birth_year: number | null;
  birth_month: number | null;
  birth_day: number | null;
  birth_order: number | null;
}

export default async function FamilyTreeChartPage({
  searchParams,
}: {
  searchParams: Promise<{ root?: string }>;
}) {
  const { root: rootParam } = await searchParams;
  const supabase = await createClient();

  // Same "page through with .range()" reasoning as the plain Tree page —
  // Supabase's project-level Max Rows setting silently caps a bare
  // .select().limit() regardless of what's asked for.
  const allPeople: PersonRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page } = await supabase
      .from("people")
      .select(
        "id, public_no, full_name, preferred_name, surname_tag, living_status, father_id, mother_id, birth_year, birth_month, birth_day, birth_order",
      )
      .is("deleted_at", null)
      .order("full_name")
      .range(from, from + 999);
    if (!page || page.length === 0) break;
    allPeople.push(...(page as PersonRow[]));
    if (page.length < 1000) break;
  }

  if (allPeople.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500">
          No one&apos;s in the tree yet. Once the legacy data is imported, it&apos;ll show up here.
        </p>
      </Card>
    );
  }

  const spouseRows: { person_a_id: string; person_b_id: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page } = await supabase.from("spouses").select("person_a_id, person_b_id").range(from, from + 999);
    if (!page || page.length === 0) break;
    spouseRows.push(...page);
    if (page.length < 1000) break;
  }

  const peopleById = new Map(allPeople.map((p) => [p.id, p]));
  const spouseNames: Record<string, string[]> = {};
  for (const { person_a_id: a, person_b_id: b } of spouseRows) {
    const pa = peopleById.get(a);
    const pb = peopleById.get(b);
    if (!pa || !pb) continue;
    (spouseNames[a] ??= []).push(pb.preferred_name?.trim() || pb.full_name);
    (spouseNames[b] ??= []).push(pa.preferred_name?.trim() || pa.full_name);
  }

  const childrenByParent = new Map<string, PersonRow[]>();
  for (const p of allPeople) {
    for (const parentId of [p.father_id, p.mother_id]) {
      if (!parentId) continue;
      const list = childrenByParent.get(parentId) ?? [];
      if (!list.some((c) => c.id === p.id)) list.push(p);
      childrenByParent.set(parentId, list);
    }
  }

  function countDescendants(personId: string, seen = new Set<string>()): number {
    if (seen.has(personId)) return 0;
    seen.add(personId);
    const kids = childrenByParent.get(personId) ?? [];
    return kids.reduce((sum, k) => sum + 1 + countDescendants(k.id, seen), 0);
  }

  // Defaults to the root of the one real family tree (most descendants),
  // same convention as the plain Tree page, rather than an arbitrary
  // person whose own ancestry was never recorded.
  const defaultRoot = allPeople
    .filter((p) => !p.father_id && !p.mother_id)
    .map((p) => ({ person: p, descendants: countDescendants(p.id) }))
    .sort((a, b) => b.descendants - a.descendants)[0]?.person;

  const rootPerson = (rootParam && peopleById.get(rootParam)) || defaultRoot;
  if (!rootPerson) {
    return (
      <Card>
        <p className="text-sm text-slate-500">No one&apos;s in the tree yet.</p>
      </Card>
    );
  }

  function buildNode(personId: string, levelsRemaining: number): FamilyTreeNode {
    const person = peopleById.get(personId)!;
    const kids = sortSiblings(childrenByParent.get(personId) ?? []);
    return {
      id: person.id,
      full_name: person.full_name,
      preferred_name: person.preferred_name,
      surname_tag: person.surname_tag,
      living_status: person.living_status,
      spouseNames: spouseNames[person.id] ?? [],
      children: levelsRemaining > 0 ? kids.map((k) => buildNode(k.id, levelsRemaining - 1)) : [],
      hiddenChildrenCount: levelsRemaining > 0 ? 0 : kids.length,
    };
  }

  const chartRoot = buildNode(rootPerson.id, VISIBLE_GENERATIONS - 1);
  const father = rootPerson.father_id ? peopleById.get(rootPerson.father_id) : null;
  const mother = rootPerson.mother_id ? peopleById.get(rootPerson.mother_id) : null;

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
        <FamilyTreeRootPicker people={allPeople} />
      </div>

      <FamilyTreeChart root={chartRoot} />
    </div>
  );
}
