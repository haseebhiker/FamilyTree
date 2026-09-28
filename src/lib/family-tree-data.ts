import type { SupabaseClient } from "@supabase/supabase-js";
import { sortSiblings } from "@/lib/sort-by-age";
import type { FamilyTreeNode, FamilyTreeRelationshipLink } from "@/components/family-tree-chart";

export interface FamilyTreePersonRow {
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

export interface FamilyTreeData {
  allPeople: FamilyTreePersonRow[];
  peopleById: Map<string, FamilyTreePersonRow>;
  childrenByParent: Map<string, FamilyTreePersonRow[]>;
  spousesById: Record<string, { id: string; name: string }[]>;
  defaultRoot: FamilyTreePersonRow | undefined;
}

/**
 * Loads everyone (paginated past Supabase's project-level Max Rows cap,
 * same reasoning as the plain Tree page) plus every marriage, and builds
 * the lookup maps both Family Tree Chart pages — the member-facing one and
 * the admin one that also draws relationship lines — need to pick a
 * default root and walk descendants.
 */
export async function loadFamilyTreeData(supabase: SupabaseClient): Promise<FamilyTreeData> {
  const allPeople: FamilyTreePersonRow[] = [];
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
    allPeople.push(...(page as FamilyTreePersonRow[]));
    if (page.length < 1000) break;
  }

  const spouseRows: { person_a_id: string; person_b_id: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page } = await supabase.from("spouses").select("person_a_id, person_b_id").range(from, from + 999);
    if (!page || page.length === 0) break;
    spouseRows.push(...page);
    if (page.length < 1000) break;
  }

  const peopleById = new Map(allPeople.map((p) => [p.id, p]));
  const spousesById: Record<string, { id: string; name: string }[]> = {};
  for (const { person_a_id: a, person_b_id: b } of spouseRows) {
    const pa = peopleById.get(a);
    const pb = peopleById.get(b);
    if (!pa || !pb) continue;
    (spousesById[a] ??= []).push({ id: b, name: pb.preferred_name?.trim() || pb.full_name });
    (spousesById[b] ??= []).push({ id: a, name: pa.preferred_name?.trim() || pa.full_name });
  }

  const childrenByParent = new Map<string, FamilyTreePersonRow[]>();
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

  return { allPeople, peopleById, childrenByParent, spousesById, defaultRoot };
}

/**
 * A depth-limited descendant subtree rooted at `personId`, `levelsRemaining`
 * generations below it — kept small on purpose (see FamilyTreeChart's
 * comment): the full tree is 1,000+ people, so a fixed depth plus "+N more"
 * links to re-root deeper is what keeps this a chart instead of the whole
 * tree dumped in the DOM.
 */
export function buildFamilyTreeNode(
  personId: string,
  levelsRemaining: number,
  data: Pick<FamilyTreeData, "peopleById" | "childrenByParent" | "spousesById">,
): FamilyTreeNode {
  const person = data.peopleById.get(personId)!;
  const kids = sortSiblings(data.childrenByParent.get(personId) ?? []);
  return {
    id: person.id,
    full_name: person.full_name,
    preferred_name: person.preferred_name,
    surname_tag: person.surname_tag,
    living_status: person.living_status,
    spouses: data.spousesById[person.id] ?? [],
    children: levelsRemaining > 0 ? kids.map((k) => buildFamilyTreeNode(k.id, levelsRemaining - 1, data)) : [],
    hiddenChildrenCount: levelsRemaining > 0 ? 0 : kids.length,
  };
}

/** Every person id that actually renders as a box in `node`'s subtree. */
export function collectNodeIds(node: FamilyTreeNode, into: Set<string> = new Set()): Set<string> {
  into.add(node.id);
  for (const child of node.children) collectNodeIds(child, into);
  return into;
}

/**
 * One line per marriage touching anyone rendered in this subtree, in two
 * flavors:
 *
 * - "cross": BOTH spouses independently appear as blood-descendant boxes —
 *   which can only happen if the two of them are related to the root
 *   through two different lines (a cousin marriage or similar). Connects
 *   the two real boxes.
 * - "marriage": the ordinary case — one spouse married in from outside the
 *   family and has no box of their own, just a name label next to their
 *   partner (FamilyTreeNode.spouses). Connects the box to that label.
 *
 * Both are found via each endpoint's `data-person-id` (a real box) or
 * `data-spouse-label` (a label) attribute — see FamilyTreeChart. Each pair
 * is returned once.
 */
export function findRelationshipLinks(
  nodeIds: Set<string>,
  spousesById: Record<string, { id: string; name: string }[]>,
): FamilyTreeRelationshipLink[] {
  const seen = new Set<string>();
  const links: FamilyTreeRelationshipLink[] = [];
  for (const id of nodeIds) {
    for (const spouse of spousesById[id] ?? []) {
      if (spouse.id === id) continue;
      const key = [id, spouse.id].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ aId: id, bId: spouse.id, kind: nodeIds.has(spouse.id) ? "cross" : "marriage" });
    }
  }
  return links;
}

/**
 * Blood ties between two people who each married INTO the family from a
 * different branch — e.g. two brothers' wives who turn out to be sisters
 * themselves. Neither has a box of their own (see findRelationshipLinks'
 * comment on "marriage" links), so unlike everything else in this file this
 * checks their own father_id/mother_id directly against each other, not
 * anything about the currently-displayed subtree. Only in-law spouses are
 * checked: two people who ARE blood-descendant boxes and share a parent are
 * already shown as ordinary sibling branches in the chart, so a line there
 * would just repeat what's already visible. Only a shared PARENT counts —
 * cousins-in-law or more distant ties aren't detected.
 */
export function findKinshipLinks(
  nodeIds: Set<string>,
  spousesById: Record<string, { id: string; name: string }[]>,
  peopleById: Map<string, FamilyTreePersonRow>,
): FamilyTreeRelationshipLink[] {
  const inLawIds = new Set<string>();
  for (const spouses of Object.values(spousesById)) {
    for (const s of spouses) {
      if (!nodeIds.has(s.id)) inLawIds.add(s.id);
    }
  }

  const ids = Array.from(inLawIds);
  const links: FamilyTreeRelationshipLink[] = [];
  for (let i = 0; i < ids.length; i++) {
    const a = peopleById.get(ids[i]);
    if (!a) continue;
    for (let j = i + 1; j < ids.length; j++) {
      const b = peopleById.get(ids[j]);
      if (!b) continue;
      if ((a.father_id && a.father_id === b.father_id) || (a.mother_id && a.mother_id === b.mother_id)) {
        links.push({ aId: ids[i], bId: ids[j], kind: "kinship" });
      }
    }
  }
  return links;
}
