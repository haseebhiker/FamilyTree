export interface PersonNode {
  id: string;
  father_id: string | null;
  mother_id: string | null;
  gender?: "M" | "F" | null;
}

export interface SpouseEdge {
  person_a_id: string;
  person_b_id: string;
}

export type EdgeKind = "father" | "mother" | "child" | "spouse";
export type Gender = "M" | "F" | null;

/** One hop in a relationship path: `id` is the person reached, `kind` is that person's relation to the PREVIOUS person in the path. */
export interface PathStep {
  id: string;
  kind: EdgeKind;
}

/**
 * Prefers each person's own recorded gender; for anyone without one
 * (common — it's a newer, optional field), falls back to inferring it
 * from showing up as someone's father_id (male) or mother_id (female).
 * Leaves with neither stay unknown and fall back to gender-neutral
 * wording.
 */
function inferGenders(people: PersonNode[]): Map<string, Gender> {
  const genders = new Map<string, Gender>();
  for (const p of people) {
    if (p.father_id) genders.set(p.father_id, "M");
    if (p.mother_id) genders.set(p.mother_id, "F");
  }
  for (const p of people) {
    if (p.gender) genders.set(p.id, p.gender);
  }
  return genders;
}

/** Every ancestor of `startId` (not including itself... except itself, at distance 0 — see below), each mapped to the up-only (father/mother) path reaching it. One path per ancestor (first found by BFS), which can miss an alternate equally-short route to the same ancestor under pedigree collapse — an accepted simplification. */
function findAncestorsWithPaths(people: PersonNode[], startId: string): Map<string, PathStep[]> {
  const byId = new Map(people.map((p) => [p.id, p]));
  const pathById = new Map<string, PathStep[]>([[startId, []]]);
  const queue = [startId];
  for (let qi = 0; qi < queue.length; qi++) {
    const id = queue[qi];
    const path = pathById.get(id)!;
    const p = byId.get(id);
    if (!p) continue;
    if (p.father_id && !pathById.has(p.father_id)) {
      pathById.set(p.father_id, [...path, { id: p.father_id, kind: "father" }]);
      queue.push(p.father_id);
    }
    if (p.mother_id && !pathById.has(p.mother_id)) {
      pathById.set(p.mother_id, [...path, { id: p.mother_id, kind: "mother" }]);
      queue.push(p.mother_id);
    }
  }
  return pathById;
}

/**
 * A common ancestor is redundant — just a vaguer restatement of a closer
 * tie already found — if some node strictly between source (or target)
 * and it is *also* a common ancestor: that closer node is the real point
 * of convergence for that particular line. Kept otherwise, even when a
 * *different*, unrelated common ancestor exists at a shorter distance —
 * e.g. someone can be both "your mom's sister" (via a close common
 * ancestor) and, independently, "your dad's cousin" (via a completely
 * different, more distant shared grandparent) at the same time. Only the
 * first of those is the single closest relationship; both are real.
 */
function isLowestCommonAncestor(
  ancestorId: string,
  sourceAncestors: Map<string, PathStep[]>,
  targetAncestors: Map<string, PathStep[]>,
): boolean {
  const srcPath = sourceAncestors.get(ancestorId)!;
  const tgtPath = targetAncestors.get(ancestorId)!;
  for (const step of srcPath.slice(0, -1)) {
    if (targetAncestors.has(step.id)) return false;
  }
  for (const step of tgtPath.slice(0, -1)) {
    if (sourceAncestors.has(step.id)) return false;
  }
  return true;
}

/**
 * True consanguinity (blood relation) means sharing a common ancestor —
 * NOT merely "reachable without crossing a spouse edge." Excluding spouse
 * edges alone isn't enough: descending to your own child and back up
 * through that child's *other* parent never touches a spouse edge either,
 * but it's exactly as much an in-law relationship as if it had. So this
 * finds *every* non-redundant common ancestor of source and target (not
 * just the closest), sorts by total up+down distance so the closest
 * relationship leads, and reconstructs the up-then-down path through
 * each — the textbook definition, and immune to the spouse-detour
 * loophole since it never considers descending before a shared ancestor.
 */
function findBloodPaths(people: PersonNode[], sourceId: string, targetId: string, maxPaths: number): PathStep[][] {
  if (sourceId === targetId) return [];
  const sourceAncestors = findAncestorsWithPaths(people, sourceId);
  const targetAncestors = findAncestorsWithPaths(people, targetId);

  const commonAncestorIds: string[] = [];
  for (const ancestorId of sourceAncestors.keys()) {
    if (!targetAncestors.has(ancestorId)) continue;
    if (!isLowestCommonAncestor(ancestorId, sourceAncestors, targetAncestors)) continue;
    commonAncestorIds.push(ancestorId);
  }
  commonAncestorIds.sort((a, b) => {
    const totalA = sourceAncestors.get(a)!.length + targetAncestors.get(a)!.length;
    const totalB = sourceAncestors.get(b)!.length + targetAncestors.get(b)!.length;
    return totalA - totalB;
  });

  return commonAncestorIds.slice(0, maxPaths).map((ancestorId) => {
    const srcPath = sourceAncestors.get(ancestorId)!;
    const tgtPath = targetAncestors.get(ancestorId)!;
    const downSteps: PathStep[] =
      tgtPath.length === 0
        ? []
        : [...tgtPath.slice(0, -1).map((s) => s.id).reverse(), targetId].map((id) => ({ id, kind: "child" as const }));
    return [...srcPath, ...downSteps];
  });
}

/**
 * Two paths that agree everywhere except one father-vs-mother hop describe
 * the exact same relationship, not two — e.g. reaching a shared child of a
 * married couple via "his father" on one path and "her mother" on the
 * other is just "sibling," found twice because BFS treats father_id and
 * mother_id as separate edges. Collapses that specific case; genuinely
 * different lines (e.g. double cousins, which diverge at more than one
 * step) are left alone.
 */
function dedupeCoupleEquivalentPaths(paths: PathStep[][], spousePairs: Set<string>): PathStep[][] {
  const kept: PathStep[][] = [];
  for (const path of paths) {
    const isDuplicate = kept.some((existing) => {
      if (existing.length !== path.length) return false;
      let diffIdx = -1;
      for (let i = 0; i < path.length; i++) {
        if (existing[i].id !== path[i].id || existing[i].kind !== path[i].kind) {
          if (diffIdx !== -1) return false; // more than one difference
          diffIdx = i;
        }
      }
      if (diffIdx === -1) return true; // identical, shouldn't happen but is a duplicate either way
      const a = existing[diffIdx];
      const b = path[diffIdx];
      const bothParentHops = (a.kind === "father" || a.kind === "mother") && (b.kind === "father" || b.kind === "mother");
      return bothParentHops && spousePairs.has([a.id, b.id].sort().join("|"));
    });
    if (!isDuplicate) kept.push(path);
  }
  return kept;
}

/**
 * A path is reducible — and should be dropped, since an equivalent
 * shorter or equal path already exists among the other candidates — if it
 * ever climbs to a parent and then immediately crosses to that parent's
 * *spouse*, where the spouse is simply the person's other recorded
 * parent. That 2-hop detour (parent, spouse) always reaches exactly the
 * same node as a single direct hop to the other parent would — e.g.
 * "wife's father's wife" is just "wife's mother" reached the long way,
 * since her father's wife *is* her mother.
 */
function hasRedundantParentSpouseDetour(path: PathStep[], sourceId: string, peopleById: Map<string, PersonNode>): boolean {
  let prevId = sourceId;
  for (let i = 0; i < path.length - 1; i++) {
    const step = path[i];
    const next = path[i + 1];
    if ((step.kind === "father" || step.kind === "mother") && next.kind === "spouse") {
      const prevPerson = peopleById.get(prevId);
      const otherParentId = step.kind === "father" ? prevPerson?.mother_id : prevPerson?.father_id;
      if (otherParentId && otherParentId === next.id) return true;
    }
    prevId = step.id;
  }
  return false;
}

/**
 * The mirror image of `hasRedundantParentSpouseDetour`: a path is reducible
 * if it crosses to a spouse and then immediately descends to a child, where
 * that child is *also* the previous person's own recorded child (with that
 * spouse) — e.g. "wife's son" is just "son" reached the long way, when the
 * son is a joint biological child rather than a stepchild from elsewhere.
 * A genuine stepchild (whose other recorded parent isn't the previous
 * person) isn't touched — that's a real, distinct in-law relationship.
 */
function hasRedundantSpouseChildDetour(path: PathStep[], sourceId: string, peopleById: Map<string, PersonNode>): boolean {
  let prevId = sourceId;
  for (let i = 0; i < path.length - 1; i++) {
    const step = path[i];
    const next = path[i + 1];
    if (step.kind === "spouse" && next.kind === "child") {
      const childPerson = peopleById.get(next.id);
      if (childPerson && (childPerson.father_id === prevId || childPerson.mother_id === prevId)) return true;
    }
    prevId = step.id;
  }
  return false;
}

function buildSpousesOf(spouses: SpouseEdge[]): Map<string, string[]> {
  const spousesOf = new Map<string, string[]>();
  for (const s of spouses) {
    if (!spousesOf.has(s.person_a_id)) spousesOf.set(s.person_a_id, []);
    if (!spousesOf.has(s.person_b_id)) spousesOf.set(s.person_b_id, []);
    spousesOf.get(s.person_a_id)!.push(s.person_b_id);
    spousesOf.get(s.person_b_id)!.push(s.person_a_id);
  }
  return spousesOf;
}

/**
 * Every relationship worth surfacing runs through source, target, or one
 * marriage connecting a blood relative of one to the other — direct blood,
 * a direct marriage, source's own spouse's blood tie to target ("wife's
 * mother"), target's spouse's blood tie to source ("great-uncle's wife" —
 * covers a target who's simply married to *any* blood relative, close or
 * distant), and the two-marriage combination ("wife's sister's husband").
 * Searching each marriage separately (rather than one global "shortest
 * path using a spouse edge" search) is what finds a real but longer
 * connection like "grandmother's brother's wife" even when a shorter,
 * unrelated in-law path to the same person already exists — the earlier
 * single-shortest-in-law approach could only ever surface one of them.
 */
export function findRelationshipPaths(
  people: PersonNode[],
  spouses: SpouseEdge[],
  sourceId: string,
  targetId: string,
  maxPaths = 20,
): { paths: PathStep[][]; genders: Map<string, Gender> } {
  const genders = inferGenders(people);
  const spousePairs = new Set(spouses.map((s) => [s.person_a_id, s.person_b_id].sort().join("|")));
  const spousesOf = buildSpousesOf(spouses);
  const dedupe = (paths: PathStep[][]) => dedupeCoupleEquivalentPaths(paths, spousePairs);

  const candidates: PathStep[][] = [];

  // 1. Direct blood.
  candidates.push(...findBloodPaths(people, sourceId, targetId, maxPaths));

  // 2. Direct marriage.
  if ((spousesOf.get(sourceId) ?? []).includes(targetId)) {
    candidates.push([{ id: targetId, kind: "spouse" }]);
  }

  // 3. Source's spouse(s) -> target, blood ("wife's mother").
  for (const mySpouseId of spousesOf.get(sourceId) ?? []) {
    if (mySpouseId === targetId) continue;
    for (const p of dedupe(findBloodPaths(people, mySpouseId, targetId, maxPaths))) {
      candidates.push([{ id: mySpouseId, kind: "spouse" }, ...p]);
    }
  }

  // 4. Source -> target's spouse(s), blood ("great-uncle's wife").
  for (const targetSpouseId of spousesOf.get(targetId) ?? []) {
    if (targetSpouseId === sourceId) continue;
    for (const p of dedupe(findBloodPaths(people, sourceId, targetSpouseId, maxPaths))) {
      candidates.push([...p, { id: targetId, kind: "spouse" }]);
    }
  }

  // 5. Source's spouse(s) -> target's spouse(s), blood ("wife's sister's husband").
  for (const mySpouseId of spousesOf.get(sourceId) ?? []) {
    if (mySpouseId === targetId) continue;
    for (const targetSpouseId of spousesOf.get(targetId) ?? []) {
      // Both guard against a real but pointless "loop back through
      // yourself" path — e.g. target's own spouse being the viewer.
      if (mySpouseId === targetSpouseId || targetSpouseId === sourceId) continue;
      for (const p of dedupe(findBloodPaths(people, mySpouseId, targetSpouseId, maxPaths))) {
        candidates.push([{ id: mySpouseId, kind: "spouse" }, ...p, { id: targetId, kind: "spouse" }]);
      }
    }
  }

  const peopleById = new Map(people.map((p) => [p.id, p]));
  const paths = dedupe(
    candidates.filter(
      (p) => !hasRedundantParentSpouseDetour(p, sourceId, peopleById) && !hasRedundantSpouseChildDetour(p, sourceId, peopleById),
    ),
  )
    .sort((a, b) => a.length - b.length)
    .slice(0, maxPaths);
  return { paths, genders };
}

/** The single-hop label for `kind`, gendered when known — e.g. what shows under one arrow in the breadcrumb. */
export function stepLabel(kind: EdgeKind, gender: Gender): string {
  if (kind === "father") return "father";
  if (kind === "mother") return "mother";
  if (kind === "child") return gender === "M" ? "son" : gender === "F" ? "daughter" : "child";
  return gender === "M" ? "husband" : gender === "F" ? "wife" : "spouse";
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function timesWord(n: number): string {
  const words = ["", "once", "twice", "three times", "four times", "five times"];
  return words[n] ?? `${n} times`;
}

function ancestorTerm(n: number, gender: Gender): string {
  if (n === 1) return gender === "M" ? "father" : gender === "F" ? "mother" : "parent";
  const base = gender === "M" ? "grandfather" : gender === "F" ? "grandmother" : "grandparent";
  return n === 2 ? base : "great-".repeat(n - 2) + base;
}

function descendantTerm(n: number, gender: Gender): string {
  if (n === 1) return gender === "M" ? "son" : gender === "F" ? "daughter" : "child";
  const base = gender === "M" ? "grandson" : gender === "F" ? "granddaughter" : "grandchild";
  return n === 2 ? base : "great-".repeat(n - 2) + base;
}

function auntUncleTerm(n: number, gender: Gender): string {
  const base = gender === "M" ? "uncle" : gender === "F" ? "aunt" : "aunt/uncle";
  return n === 2 ? base : "great-".repeat(n - 2) + base;
}

function nieceNephewTerm(n: number, gender: Gender): string {
  const base = gender === "M" ? "nephew" : gender === "F" ? "niece" : "niece/nephew";
  return n === 2 ? base : "grand-".repeat(n - 2) + base;
}

/** up = generations climbed toward a common ancestor, down = generations descended back down from there. */
function describeBlood(up: number, down: number, gender: Gender): string {
  if (up === 0) return descendantTerm(down, gender);
  if (down === 0) return ancestorTerm(up, gender);
  if (up === 1 && down === 1) return gender === "M" ? "brother" : gender === "F" ? "sister" : "sibling";
  if (up === 1) return nieceNephewTerm(down, gender);
  if (down === 1) return auntUncleTerm(up, gender);
  const degree = Math.min(up, down) - 1;
  const removed = Math.abs(up - down);
  return `${ordinal(degree)} cousin${removed > 0 ? ` ${timesWord(removed)} removed` : ""}`;
}

function blood(steps: PathStep[], genders: Map<string, Gender>): string | null {
  const up = steps.filter((s) => s.kind === "father" || s.kind === "mother").length;
  const down = steps.filter((s) => s.kind === "child").length;
  if (up + down !== steps.length || steps.length === 0) return null;
  const gender = genders.get(steps[steps.length - 1].id) ?? null;
  return describeBlood(up, down, gender);
}

/**
 * A more specific phrase than the canonical headline term, disambiguating
 * which side or which sibling a relationship runs through — e.g. "father's
 * sister" rather than just "aunt". Only defined for the two shapes with an
 * obvious one-hop English decomposition (aunt/uncle, niece/nephew); a
 * direct-line or sibling term is already as specific as it gets, and
 * cousins/deeper/in-law paths don't have as clean a one-line phrase, so
 * those return null — the caller falls back to just the canonical term
 * plus the full step-by-step chain, which is always shown regardless.
 */
export function describeSpecificBlood(steps: PathStep[], genders: Map<string, Gender>): string | null {
  const up = steps.filter((s) => s.kind === "father" || s.kind === "mother").length;
  const down = steps.filter((s) => s.kind === "child").length;
  if (up + down !== steps.length || steps.length === 0) return null;

  if (up === 2 && down === 1) {
    // aunt/uncle: "{first hop}'s {sibling term}"
    const targetGender = genders.get(steps[steps.length - 1].id) ?? null;
    const siblingTerm = targetGender === "M" ? "brother" : targetGender === "F" ? "sister" : "sibling";
    return `${stepLabel(steps[0].kind, null)}'s ${siblingTerm}`;
  }
  if (up === 1 && down === 2) {
    // niece/nephew: "{sibling term}'s {final hop}"
    const siblingGender = genders.get(steps[1].id) ?? null;
    const siblingTerm = siblingGender === "M" ? "brother" : siblingGender === "F" ? "sister" : "sibling";
    const finalGender = genders.get(steps[steps.length - 1].id) ?? null;
    return `${siblingTerm}'s ${stepLabel(steps[steps.length - 1].kind, finalGender)}`;
  }
  return null;
}

/**
 * A single canonical term for the relationship a shortest path represents,
 * e.g. "uncle" or "1st cousin once removed" for pure-blood paths, or
 * "wife's sister's husband" for the classic in-law pattern (spouse, blood
 * segment, spouse). Returns null for anything more tangled than that —
 * the caller should fall back to just showing the step-by-step path, which
 * is always available regardless.
 */
export function describeRelationship(steps: PathStep[], genders: Map<string, Gender>): string | null {
  if (steps.length === 0) return null;
  if (steps.length === 1) return stepLabel(steps[0].kind, genders.get(steps[0].id) ?? null);

  const spouseIdx = steps.map((s, i) => (s.kind === "spouse" ? i : -1)).filter((i) => i >= 0);

  if (spouseIdx.length === 0) return blood(steps, genders);

  const spouseTermFor = (id: string) => {
    const g = genders.get(id) ?? null;
    return g === "M" ? "husband" : g === "F" ? "wife" : "spouse";
  };

  if (spouseIdx.length === 1 && spouseIdx[0] === steps.length - 1) {
    const bloodTerm = blood(steps.slice(0, -1), genders);
    return bloodTerm ? `${bloodTerm}'s ${spouseTermFor(steps[steps.length - 1].id)}` : null;
  }
  if (spouseIdx.length === 1 && spouseIdx[0] === 0) {
    const bloodTerm = blood(steps.slice(1), genders);
    return bloodTerm ? `${spouseTermFor(steps[0].id)}'s ${bloodTerm}` : null;
  }
  if (spouseIdx.length === 2 && spouseIdx[0] === 0 && spouseIdx[1] === steps.length - 1) {
    const middle = steps.slice(1, -1);
    const bloodTerm = blood(middle, genders);
    if (!bloodTerm) return null;
    return `${spouseTermFor(steps[0].id)}'s ${bloodTerm}'s ${spouseTermFor(steps[steps.length - 1].id)}`;
  }
  return null;
}
