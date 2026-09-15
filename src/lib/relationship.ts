export interface PersonNode {
  id: string;
  father_id: string | null;
  mother_id: string | null;
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

interface Edge {
  to: string;
  kind: EdgeKind;
}

/**
 * A person's sex is never stored directly, but is implied wherever they
 * show up as someone's father_id (male) or mother_id (female) — which
 * covers anyone with a child in the tree. Leaves (no children on record)
 * stay unknown and fall back to gender-neutral wording.
 */
function inferGenders(people: PersonNode[]): Map<string, Gender> {
  const genders = new Map<string, Gender>();
  for (const p of people) {
    if (p.father_id) genders.set(p.father_id, "M");
    if (p.mother_id) genders.set(p.mother_id, "F");
  }
  return genders;
}

function buildAdjacency(people: PersonNode[], spouses: SpouseEdge[]): Map<string, Edge[]> {
  const adjacency = new Map<string, Edge[]>();
  function link(a: string, b: string, aToB: EdgeKind, bToA: EdgeKind) {
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a)!.push({ to: b, kind: aToB });
    adjacency.get(b)!.push({ to: a, kind: bToA });
  }
  for (const p of people) {
    if (p.father_id) link(p.id, p.father_id, "father", "child");
    if (p.mother_id) link(p.id, p.mother_id, "mother", "child");
  }
  for (const s of spouses) {
    link(s.person_a_id, s.person_b_id, "spouse", "spouse");
  }
  return adjacency;
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
 * True consanguinity (blood relation) means sharing a common ancestor —
 * NOT merely "reachable without crossing a spouse edge." Excluding spouse
 * edges alone isn't enough: descending to your own child and back up
 * through that child's *other* parent never touches a spouse edge either,
 * but it's exactly as much an in-law relationship as if it had. So this
 * finds every common ancestor of source and target, keeps only the one(s)
 * minimizing total up+down distance, and reconstructs the up-then-down
 * path through each — the textbook definition, and immune to that
 * loophole since it never considers descending before the shared ancestor.
 */
function findBloodPaths(people: PersonNode[], sourceId: string, targetId: string, maxPaths: number): PathStep[][] {
  if (sourceId === targetId) return [];
  const sourceAncestors = findAncestorsWithPaths(people, sourceId);
  const targetAncestors = findAncestorsWithPaths(people, targetId);

  let bestTotal = Infinity;
  let commonAncestorIds: string[] = [];
  for (const [ancestorId, srcPath] of sourceAncestors) {
    const tgtPath = targetAncestors.get(ancestorId);
    if (!tgtPath) continue;
    const total = srcPath.length + tgtPath.length;
    if (total < bestTotal) {
      bestTotal = total;
      commonAncestorIds = [ancestorId];
    } else if (total === bestTotal) {
      commonAncestorIds.push(ancestorId);
    }
  }

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
 * Shortest path(s) that use at least one spouse edge — Geni's "shortest
 * in-law relationship." A plain BFS can't answer this: the globally
 * shortest path might happen to be pure blood, which would hide a real
 * in-law relationship rather than reporting "none." Instead this walks a
 * doubled state space, (node, hasUsedSpouseEdge), so "shortest path that
 * has used a spouse edge by the time it reaches the target" is just an
 * ordinary shortest-path search over that bigger graph.
 */
function findShortestPathsViaSpouse(
  adjacency: Map<string, Edge[]>,
  sourceId: string,
  targetId: string,
  maxPaths: number,
): PathStep[][] {
  if (sourceId === targetId) return [];

  const startState = `${sourceId}|0`;
  const dist = new Map<string, number>([[startState, 0]]);
  const predecessors = new Map<string, { from: string; kind: EdgeKind }[]>();
  const queue = [startState];
  for (let qi = 0; qi < queue.length; qi++) {
    const curState = queue[qi];
    const sep = curState.lastIndexOf("|");
    const curId = curState.slice(0, sep);
    const curUsed = curState.slice(sep + 1) === "1";
    const curDist = dist.get(curState)!;
    for (const e of adjacency.get(curId) ?? []) {
      const nextUsed = curUsed || e.kind === "spouse";
      const nextState = `${e.to}|${nextUsed ? 1 : 0}`;
      const existing = dist.get(nextState);
      if (existing === undefined) {
        dist.set(nextState, curDist + 1);
        predecessors.set(nextState, [{ from: curState, kind: e.kind }]);
        queue.push(nextState);
      } else if (existing === curDist + 1) {
        predecessors.get(nextState)!.push({ from: curState, kind: e.kind });
      }
    }
  }

  const targetState = `${targetId}|1`;
  if (!dist.has(targetState)) return [];

  const results: PathStep[][] = [];
  function backtrack(state: string, suffix: PathStep[]) {
    if (results.length >= maxPaths) return;
    if (state === startState) {
      results.push(suffix);
      return;
    }
    const sep = state.lastIndexOf("|");
    const nodeId = state.slice(0, sep);
    for (const pred of predecessors.get(state) ?? []) {
      if (results.length >= maxPaths) return;
      backtrack(pred.from, [{ id: nodeId, kind: pred.kind }, ...suffix]);
    }
  }
  backtrack(targetState, []);
  return results;
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
 * Blood and in-law relationships are searched independently, then merged
 * — matching Geni's "shortest blood relationship" / "shortest in-law
 * relationship", each minimized on its own. A single combined search
 * would silently drop a real but longer blood relationship (e.g. "also
 * your mom's sister") whenever a shorter in-law path exists (e.g. "your
 * wife's mother") to the very same person, since only the shorter one
 * would ever be tied for globally shortest.
 */
export function findRelationshipPaths(
  people: PersonNode[],
  spouses: SpouseEdge[],
  sourceId: string,
  targetId: string,
  maxPaths = 5,
): { paths: PathStep[][]; genders: Map<string, Gender> } {
  const fullAdjacency = buildAdjacency(people, spouses);
  const genders = inferGenders(people);
  const spousePairs = new Set(spouses.map((s) => [s.person_a_id, s.person_b_id].sort().join("|")));

  const bloodPaths = dedupeCoupleEquivalentPaths(findBloodPaths(people, sourceId, targetId, maxPaths), spousePairs);
  let inLawPaths = dedupeCoupleEquivalentPaths(
    findShortestPathsViaSpouse(fullAdjacency, sourceId, targetId, maxPaths),
    spousePairs,
  );
  // Only worth surfacing when it's not just a longer, redundant detour
  // through a blood relative's spouse to a target blood already reaches
  // more directly (e.g. "grandfather's wife's child" for someone who's
  // already your uncle via grandfather directly) — genuinely distinct
  // in-law relationships (like "wife's mother") are at least as short.
  if (bloodPaths.length > 0 && inLawPaths.length > 0 && inLawPaths[0].length >= bloodPaths[0].length) {
    inLawPaths = [];
  }

  const paths = [...bloodPaths, ...inLawPaths]
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
