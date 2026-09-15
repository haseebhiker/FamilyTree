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

/** BFS shortest distance from sourceId, then reconstructs every path tied for shortest (capped at maxPaths) via recorded predecessors. */
function findShortestPaths(
  adjacency: Map<string, Edge[]>,
  sourceId: string,
  targetId: string,
  maxPaths: number,
): PathStep[][] {
  if (sourceId === targetId) return [];

  const dist = new Map<string, number>([[sourceId, 0]]);
  const predecessors = new Map<string, { from: string; kind: EdgeKind }[]>();
  const queue = [sourceId];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    const curDist = dist.get(cur)!;
    for (const e of adjacency.get(cur) ?? []) {
      const existing = dist.get(e.to);
      if (existing === undefined) {
        dist.set(e.to, curDist + 1);
        predecessors.set(e.to, [{ from: cur, kind: e.kind }]);
        queue.push(e.to);
      } else if (existing === curDist + 1) {
        predecessors.get(e.to)!.push({ from: cur, kind: e.kind });
      }
    }
  }
  if (!dist.has(targetId)) return [];

  const results: PathStep[][] = [];
  function backtrack(node: string, suffix: PathStep[]) {
    if (results.length >= maxPaths) return;
    if (node === sourceId) {
      results.push(suffix);
      return;
    }
    for (const pred of predecessors.get(node) ?? []) {
      if (results.length >= maxPaths) return;
      backtrack(pred.from, [{ id: node, kind: pred.kind }, ...suffix]);
    }
  }
  backtrack(targetId, []);
  return results;
}

export function findRelationshipPaths(
  people: PersonNode[],
  spouses: SpouseEdge[],
  sourceId: string,
  targetId: string,
  maxPaths = 5,
): { paths: PathStep[][]; genders: Map<string, Gender> } {
  const adjacency = buildAdjacency(people, spouses);
  const genders = inferGenders(people);
  const paths = findShortestPaths(adjacency, sourceId, targetId, maxPaths);
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
