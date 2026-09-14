import { createClient } from "@/lib/supabase/server";
import { TreeView, type TreeNodeData } from "@/components/tree-view";
import { Card } from "@/components/ui";

export default async function HomePage() {
  const supabase = await createClient();

  // Supabase's project-level "Max Rows" API setting (default 1000) caps
  // any single request regardless of an explicit .limit() — silently, with
  // no error — so a straight .select().limit(5000) truncates a ~1,048-row
  // table. Page through with .range() instead so the tree is never missing
  // people no matter what that setting is.
  const allPeople: TreeNodeData[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page } = await supabase
      .from("people")
      .select("id, full_name, surname_tag, living_status, father_id, mother_id")
      .order("full_name")
      .range(from, from + 999);
    if (!page || page.length === 0) break;
    allPeople.push(...(page as TreeNodeData[]));
    if (page.length < 1000) break;
  }

  const childrenByParent = new Map<string, TreeNodeData[]>();
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

  // Sort so the one real family tree (rooted at the person with the most
  // descendants) leads, instead of being buried among dozens of tiny
  // disconnected "roots" — people whose own parents were never recorded,
  // e.g. a spouse who married in with no further ancestry in this data.
  const roots = allPeople
    .filter((p) => !p.father_id && !p.mother_id)
    .map((p) => ({ person: p, descendants: countDescendants(p.id) }))
    .sort((a, b) => b.descendants - a.descendants)
    .map((r) => r.person);

  if (allPeople.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500">
          No one&apos;s in the tree yet. Once the legacy data is imported, it&apos;ll show up here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{allPeople.length} people</p>
      <TreeView roots={roots} allPeople={allPeople} />
    </div>
  );
}
