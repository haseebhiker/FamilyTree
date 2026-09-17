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

export interface TamilTerm {
  tamil: string;
  translit: string;
}

/**
 * Which of source's two parents (or grandparents) a blood path's first hop
 * runs through — "father" or "mother" become the "Appa vazhi" / "Umma
 * vazhi" side qualifier on grandparent and distant-cousin terms below.
 */
function firstHopSide(steps: PathStep[]): "father" | "mother" | null {
  return steps[0]?.kind === "father" ? "father" : steps[0]?.kind === "mother" ? "mother" : null;
}

const SIDE_TAMIL: Record<"father" | "mother", TamilTerm> = {
  father: { tamil: "அப்பா வழி", translit: "Appa vazhi" },
  mother: { tamil: "உம்மா வழி", translit: "Umma vazhi" },
};

/**
 * `a` and `b` are two people one generation apart in a known family
 * relationship (a person and their sibling, or a parent and that parent's
 * sibling) — this says which one is older, so callers can pick between an
 * "older"/"younger" pair of Tamil terms (Periya Anna vs. Thambi, Periyappa
 * vs. Chithappa, etc.). Prefers birth_year; when either is missing (common
 * in this tree), falls back to birth_order — valid here specifically
 * because `a` and `b` are always full siblings of each other (see callers),
 * so their birth_order values rank them against exactly the same set of
 * siblings, unlike birth_year which needs no such relationship to compare.
 * Returns null only when NEITHER birth_year nor birth_order distinguishes
 * them; callers show BOTH terms joined by "/" in that case (e.g.
 * "Periyappa/Chithappa") rather than guessing which one or showing nothing.
 */
function olderOf(
  a: string,
  b: string,
  birthYears: Map<string, number | null | undefined>,
  birthOrders: Map<string, number | null | undefined>,
): "a" | "b" | null {
  const yearA = birthYears.get(a);
  const yearB = birthYears.get(b);
  if (yearA && yearB && yearA !== yearB) return yearA < yearB ? "a" : "b";

  const orderA = birthOrders.get(a);
  const orderB = birthOrders.get(b);
  if (orderA && orderB && orderA !== orderB) return orderA < orderB ? "a" : "b";

  return null;
}

/**
 * The Tamil term for `auntUncleId`, a sibling of `parentId` (source's
 * father or mother, `side` says which) — shared by the aunt/uncle case
 * itself (up=2, down=1) and the first-cousin case (up=2, down=2), where the
 * exact same aunt/uncle sits partway down the path (see
 * describeRelationshipTamil) and the cousin's term is just this plus
 * "Pillai" (child), per the Chennai Tamil Muslim usage Haseeb described:
 * Mama Pillai, Periyappa Pillai, etc. rather than a single generic
 * "cousin" word.
 */
function tamilAuntUncleTerm(
  parentId: string,
  side: "father" | "mother",
  auntUncleId: string,
  genders: Map<string, Gender>,
  birthYears: Map<string, number | null | undefined>,
  birthOrders: Map<string, number | null | undefined>,
): TamilTerm | null {
  const gender = genders.get(auntUncleId) ?? null;
  if (gender !== "M" && gender !== "F") return null;

  if (side === "father") {
    if (gender === "F") return { tamil: "மாமி", translit: "Mami" };
    // olderOf(parentId, auntUncleId): "a" means the PARENT is older, i.e.
    // auntUncleId is the YOUNGER sibling — Chithappa, not Periyappa. When
    // neither birth_year nor birth_order distinguishes them, show both
    // rather than nothing — see the fallback note on describeRelationshipTamil.
    const order = olderOf(parentId, auntUncleId, birthYears, birthOrders);
    if (!order) return { tamil: "பெரியப்பா/சித்தப்பா", translit: "Periyappa/Chithappa" };
    return order === "b" ? { tamil: "பெரியப்பா", translit: "Periyappa" } : { tamil: "சித்தப்பா", translit: "Chithappa" };
  }
  if (gender === "M") return { tamil: "மாமா", translit: "Mama" };
  const order = olderOf(parentId, auntUncleId, birthYears, birthOrders);
  if (!order) return { tamil: "பெரியம்மா/சின்னம்மா", translit: "Periyamma/Chinnamma" };
  return order === "b" ? { tamil: "பெரியம்மா", translit: "Periyamma" } : { tamil: "சின்னம்மா", translit: "Chinnamma" };
}

function spouseTamilTerm(id: string, genders: Map<string, Gender>): TamilTerm | null {
  const gender = genders.get(id) ?? null;
  if (gender === "M") return { tamil: "புருஷன்", translit: "Purushan" };
  if (gender === "F") return { tamil: "பொண்டாட்டி", translit: "Pondatti" };
  return null;
}

/**
 * Haseeb's vocabulary doesn't include dedicated in-law words (no single
 * term for "mother-in-law"), so these are composed instead, the same way
 * Appa vazhi / Umma vazhi already compose a side onto a blood term:
 * "Pondatti vazhi Pethamma" ("grandmother, through [my] wife") rather than
 * a specific borrowed word. A path with a spouse hop always has one of
 * three shapes — source's spouse then blood ("wife's mother"), blood then
 * target's spouse ("great-uncle's wife"), or both ("wife's sister's
 * husband") — handled by recursing into the blood segment with
 * describeRelationshipTamil, re-rooted at whichever spouse that segment is
 * actually relative to (age comparisons inside it need to run against that
 * spouse, not the original viewer).
 */
function describeInLawTamil(
  steps: PathStep[],
  spouseIdx: number[],
  genders: Map<string, Gender>,
  birthYears: Map<string, number | null | undefined>,
  birthOrders: Map<string, number | null | undefined>,
  sourceId: string,
): TamilTerm | null {
  if (spouseIdx.length === 1 && spouseIdx[0] === 0) {
    const spouseId = steps[0].id;
    const prefix = spouseTamilTerm(spouseId, genders);
    const rest = steps.slice(1);
    const inner = rest.length > 0 ? describeRelationshipTamil(rest, genders, birthYears, birthOrders, spouseId) : null;
    if (!prefix || !inner) return null;
    return { tamil: `${prefix.tamil} வழி ${inner.tamil}`, translit: `${prefix.translit} vazhi ${inner.translit}` };
  }

  if (spouseIdx.length === 1 && spouseIdx[0] === steps.length - 1) {
    const bloodSteps = steps.slice(0, -1);
    const bloodTerm = bloodSteps.length > 0 ? describeRelationshipTamil(bloodSteps, genders, birthYears, birthOrders, sourceId) : null;
    const spouseTerm = spouseTamilTerm(steps[steps.length - 1].id, genders);
    if (!bloodTerm || !spouseTerm) return null;
    return { tamil: `${bloodTerm.tamil} ${spouseTerm.tamil}`, translit: `${bloodTerm.translit} ${spouseTerm.translit}` };
  }

  if (spouseIdx.length === 2 && spouseIdx[0] === 0 && spouseIdx[1] === steps.length - 1) {
    const spouseId = steps[0].id;
    const prefix = spouseTamilTerm(spouseId, genders);
    const middle = steps.slice(1, -1);
    const middleTerm = middle.length > 0 ? describeRelationshipTamil(middle, genders, birthYears, birthOrders, spouseId) : null;
    const lastSpouseTerm = spouseTamilTerm(steps[steps.length - 1].id, genders);
    if (!prefix || !middleTerm || !lastSpouseTerm) return null;
    return {
      tamil: `${prefix.tamil} வழி ${middleTerm.tamil} ${lastSpouseTerm.tamil}`,
      translit: `${prefix.translit} vazhi ${middleTerm.translit} ${lastSpouseTerm.translit}`,
    };
  }

  return null;
}

/**
 * The Chennai Tamil Muslim term for the relationship a shortest path
 * represents, per the vocabulary Haseeb gave — parent, child, sibling,
 * grandparent, aunt/uncle, and first cousin, each split by side (Appa
 * vazhi / Umma vazhi) and, where the vocabulary distinguishes it, by
 * relative age. Anything deeper (great-grandparents, cousins beyond the
 * first, cousins "once removed", etc.) falls back to a general "distant
 * relative on X's side" phrase rather than inventing a specific term. A
 * relationship that crosses a marriage (in-laws) is composed via
 * describeInLawTamil rather than a dedicated word, since none was given.
 */
export function describeRelationshipTamil(
  steps: PathStep[],
  genders: Map<string, Gender>,
  birthYears: Map<string, number | null | undefined>,
  birthOrders: Map<string, number | null | undefined>,
  sourceId: string,
): TamilTerm | null {
  if (steps.length === 0) return null;

  if (steps.length === 1 && steps[0].kind === "spouse") {
    return spouseTamilTerm(steps[0].id, genders);
  }

  const spouseIdx = steps.map((s, i) => (s.kind === "spouse" ? i : -1)).filter((i) => i >= 0);
  if (spouseIdx.length > 0) {
    return describeInLawTamil(steps, spouseIdx, genders, birthYears, birthOrders, sourceId);
  }

  const up = steps.filter((s) => s.kind === "father" || s.kind === "mother").length;
  const down = steps.filter((s) => s.kind === "child").length;
  if (up + down !== steps.length) return null;

  const targetId = steps[steps.length - 1].id;
  const targetGender = genders.get(targetId) ?? null;
  const side = firstHopSide(steps);

  if (up === 1 && down === 0) {
    if (targetGender === "M") return { tamil: "வாப்பா", translit: "Vappa" };
    if (targetGender === "F") return { tamil: "உம்மா", translit: "Umma" };
    return null;
  }
  if (up === 0 && down === 1) {
    if (targetGender === "M") return { tamil: "மகன்", translit: "Magan" };
    if (targetGender === "F") return { tamil: "மகள்", translit: "Magal" };
    return null;
  }
  if (up === 1 && down === 1) {
    if (targetGender !== "M" && targetGender !== "F") return null;
    const order = olderOf(sourceId, targetId, birthYears, birthOrders);
    if (targetGender === "M") {
      if (!order) return { tamil: "பெரிய அண்ணா/தம்பி", translit: "Periya Anna/Thambi" };
      return order === "b" ? { tamil: "பெரிய அண்ணா", translit: "Periya Anna" } : { tamil: "தம்பி", translit: "Thambi" };
    }
    if (!order) return { tamil: "பெரியக்கா/தங்கச்சி", translit: "Periyakka/Thangachi" };
    return order === "b" ? { tamil: "பெரியக்கா", translit: "Periyakka" } : { tamil: "தங்கச்சி", translit: "Thangachi" };
  }
  if (up === 2 && down === 0) {
    if (!side || (targetGender !== "M" && targetGender !== "F")) return null;
    const base = targetGender === "M" ? { tamil: "பெத்தப்பா", translit: "Pethappa" } : { tamil: "பெத்தம்மா", translit: "Pethamma" };
    return { tamil: `${SIDE_TAMIL[side].tamil} ${base.tamil}`, translit: `${SIDE_TAMIL[side].translit} ${base.translit}` };
  }
  if (up === 2 && down === 1) {
    if (!side) return null;
    return tamilAuntUncleTerm(steps[0].id, side, targetId, genders, birthYears, birthOrders);
  }
  if (up === 1 && down === 2) {
    const siblingId = steps[1].id;
    const siblingGender = genders.get(siblingId) ?? null;
    if (siblingGender !== "M" && siblingGender !== "F") return null;
    const order = olderOf(sourceId, siblingId, birthYears, birthOrders);
    const siblingTerm = !order
      ? siblingGender === "M"
        ? { tamil: "அண்ணன்/தம்பி", translit: "Anna/Thambi" }
        : { tamil: "அக்கா/தங்கச்சி", translit: "Akka/Thangachi" }
      : siblingGender === "M"
        ? order === "b"
          ? { tamil: "அண்ணன்", translit: "Anna" }
          : { tamil: "தம்பி", translit: "Thambi" }
        : order === "b"
          ? { tamil: "அக்கா", translit: "Akka" }
          : { tamil: "தங்கச்சி", translit: "Thangachi" };
    return { tamil: `${siblingTerm.tamil} பிள்ளை`, translit: `${siblingTerm.translit} Pillai` };
  }
  if (up === 2 && down === 2) {
    if (!side) return null;
    const auntUncle = tamilAuntUncleTerm(steps[0].id, side, steps[2].id, genders, birthYears, birthOrders);
    if (!auntUncle) return null;
    return { tamil: `${auntUncle.tamil} பிள்ளை`, translit: `${auntUncle.translit} Pillai` };
  }

  if (!side) return null;
  return { tamil: `${SIDE_TAMIL[side].tamil} தூரத்து சொந்தம்`, translit: `${SIDE_TAMIL[side].translit} doorathu sontham` };
}

/**
 * A small, separate set of Hindi/Urdu terms Haseeb's family also uses
 * alongside the Tamil ones above — just grandparents and a brother's wife
 * so far, not a parallel system covering everything describeRelationshipTamil
 * does. Returns null for every other shape rather than guessing a Hindi
 * word that wasn't given. Shown in its own color in the UI to mark it as a
 * different language from the Tamil term next to it.
 */
export function describeRelationshipHindi(steps: PathStep[], genders: Map<string, Gender>): string | null {
  if (steps.length === 0) return null;

  // Grandparent: up=2, down=0, no spouse hop.
  if (steps.length === 2) {
    const side = firstHopSide(steps);
    const isGrandparent = (steps[0].kind === "father" || steps[0].kind === "mother") && (steps[1].kind === "father" || steps[1].kind === "mother");
    if (side && isGrandparent) {
      const gender = genders.get(steps[1].id) ?? null;
      if (gender === "M") return side === "father" ? "Dada" : "Nana";
      if (gender === "F") return side === "father" ? "Dadi" : "Nani";
    }
  }

  // Brother's wife: up (father/mother), child (the brother), spouse (his wife).
  if (
    steps.length === 3 &&
    (steps[0].kind === "father" || steps[0].kind === "mother") &&
    steps[1].kind === "child" &&
    steps[2].kind === "spouse"
  ) {
    const siblingGender = genders.get(steps[1].id) ?? null;
    const spouseGender = genders.get(steps[2].id) ?? null;
    if (siblingGender === "M" && spouseGender === "F") return "Bhabhi";
  }

  return null;
}
