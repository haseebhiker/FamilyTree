/**
 * Shared logic for the Import Review page and its actions: matching rows of
 * the temp_people staging table against the live tree, working out where a
 * new person would attach, and what differs for a match. Pure functions over
 * already-loaded rows — no database access here.
 */

export interface TempRow {
  shaheen_id: string;
  full_name: string;
  birth_order: number | null;
  living_status: string | null;
  matched_people_id: string | null;
  match_status: string;
  father_name: string | null;
  mother_name: string | null;
  spouse_name: string | null;
  children_names: string | null;
  review_status: "pending" | "confirmed" | "added" | "skipped";
  resolved_people_id: string | null;
}

export interface PersonRow {
  id: string;
  full_name: string;
  preferred_name: string | null;
  surname_tag: string | null;
  gender: "M" | "F" | null;
  birth_order: number | null;
  living_status: "living" | "deceased" | "unknown";
  father_id: string | null;
  mother_id: string | null;
}

export interface SpouseRow {
  person_a_id: string;
  person_b_id: string;
}

export interface PersonSnapshot {
  id: string;
  fullName: string;
  preferredName: string | null;
  surnameTag: string | null;
  gender: "M" | "F" | null;
  birthOrder: number | null;
  livingStatus: string;
  fatherName: string | null;
  motherName: string | null;
  spouses: string[];
  children: string[];
}

export interface Diff {
  field: "full_name" | "birth_order" | "living_status";
  label: string;
  source: string;
  tree: string;
  /** Tree has nothing (or "unknown") here, so applying the source value is a pure fill-in rather than an overwrite. */
  treeEmpty: boolean;
}

export interface AddPlan {
  ready: boolean;
  blocker: string | null;
  fatherId: string | null;
  motherId: string | null;
  fatherName: string | null;
  motherName: string | null;
  /** Things the tree doesn't have linked, so the admin knows what is NOT being connected. */
  notes: string[];
  gender: "M" | "F" | null;
  spouseToAdd: string | null;
  spouseCandidates: PersonSnapshot[];
}

export interface RowView {
  shaheenId: string;
  fullName: string;
  birthOrder: number | null;
  livingStatus: string | null;
  matchStatus: string;
  reviewStatus: TempRow["review_status"];
  resolvedPersonId: string | null;
  resolvedPersonName: string | null;
  sourceFather: string | null;
  sourceMother: string | null;
  sourceSpouse: string | null;
  sourceChildren: string[];
  parentLabel: string | null;
  matched: PersonSnapshot | null;
  diffs: Diff[];
  childrenMissingInTree: string[];
  candidates: (PersonSnapshot & { score: number })[];
  add: AddPlan | null;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

function bigrams(s: string): Map<string, number> {
  const n = normalize(s);
  const m = new Map<string, number>();
  for (let i = 0; i < n.length - 1; i++) {
    const g = n.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Dice coefficient over letter pairs, ignoring case/spaces/punctuation — forgiving of "Mohammed"/"Mohamed" and "AbdulRazak"/"Abdul Razak". */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let ta = 0;
  let tb = 0;
  for (const [g, c] of A) {
    ta += c;
    const other = B.get(g);
    if (other) inter += Math.min(c, other);
  }
  for (const c of B.values()) tb += c;
  return ta + tb === 0 ? 0 : (2 * inter) / (ta + tb);
}

export function parentShaheenId(id: string): string | null {
  const i = id.lastIndexOf(".");
  return i === -1 ? null : id.slice(0, i);
}

/** Natural order for ids like 1.10.2 vs 1.9 — numeric per segment. */
export function compareShaheenIds(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

export function splitNames(s: string | null): string[] {
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export class ImportContext {
  readonly tempById: Map<string, TempRow>;
  readonly personById: Map<string, PersonRow>;
  private readonly spousesOf = new Map<string, string[]>();
  private readonly childrenOf = new Map<string, string[]>();
  private readonly tempChildren = new Map<string, TempRow[]>();

  constructor(
    readonly temps: TempRow[],
    readonly people: PersonRow[],
    spouses: SpouseRow[],
  ) {
    this.tempById = new Map(temps.map((t) => [t.shaheen_id, t]));
    this.personById = new Map(people.map((p) => [p.id, p]));
    for (const s of spouses) {
      for (const [x, y] of [
        [s.person_a_id, s.person_b_id],
        [s.person_b_id, s.person_a_id],
      ] as const) {
        const list = this.spousesOf.get(x) ?? [];
        list.push(y);
        this.spousesOf.set(x, list);
      }
    }
    for (const p of people) {
      for (const parent of [p.father_id, p.mother_id]) {
        if (!parent) continue;
        const list = this.childrenOf.get(parent) ?? [];
        list.push(p.id);
        this.childrenOf.set(parent, list);
      }
    }
    for (const t of temps) {
      const pid = parentShaheenId(t.shaheen_id);
      if (!pid) continue;
      const list = this.tempChildren.get(pid) ?? [];
      list.push(t);
      this.tempChildren.set(pid, list);
    }
  }

  /** The live person this row stands for, once known: explicitly resolved, or an exact match not yet looked at (good enough to hang children off). */
  resolvedPersonId(row: TempRow): string | null {
    if (row.review_status === "skipped") return null;
    if (row.resolved_people_id) return row.resolved_people_id;
    if (row.match_status === "MATCHED_EXACT" && row.matched_people_id) return row.matched_people_id;
    return null;
  }

  snapshot(personId: string): PersonSnapshot | null {
    const p = this.personById.get(personId);
    if (!p) return null;
    const name = (id: string | null) => (id ? (this.personById.get(id)?.full_name ?? null) : null);
    return {
      id: p.id,
      fullName: p.full_name,
      preferredName: p.preferred_name,
      surnameTag: p.surname_tag,
      gender: p.gender,
      birthOrder: p.birth_order,
      livingStatus: p.living_status,
      fatherName: name(p.father_id),
      motherName: name(p.mother_id),
      spouses: (this.spousesOf.get(p.id) ?? []).map((id) => name(id)).filter((n): n is string => !!n),
      children: (this.childrenOf.get(p.id) ?? []).map((id) => name(id)).filter((n): n is string => !!n),
    };
  }

  candidates(name: string, limit = 3, threshold = 0.62): (PersonSnapshot & { score: number })[] {
    // Family members share surnames, so overall similarity alone flags a child
    // as a "match" for their own parent — also require the first names to agree.
    const first = (s: string) => s.trim().split(/\s+/)[0];
    return this.people
      .map((p) => ({ p, score: nameSimilarity(name, p.full_name) }))
      .filter((x) => x.score >= threshold && nameSimilarity(first(name), first(x.p.full_name)) >= 0.6)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => ({ ...this.snapshot(x.p.id)!, score: x.score }));
  }

  inferGender(row: TempRow): "M" | "F" | null {
    let male = 0;
    let female = 0;
    for (const child of this.tempChildren.get(row.shaheen_id) ?? []) {
      const sf = nameSimilarity(child.father_name, row.full_name);
      const sm = nameSimilarity(child.mother_name, row.full_name);
      if (sf >= 0.5 && sf > sm) male++;
      else if (sm >= 0.5 && sm > sf) female++;
    }
    if (male > female) return "M";
    if (female > male) return "F";
    return null;
  }

  diffs(row: TempRow, person: PersonRow): Diff[] {
    const out: Diff[] = [];
    if (normalize(row.full_name) !== normalize(person.full_name)) {
      out.push({ field: "full_name", label: "Name", source: row.full_name, tree: person.full_name, treeEmpty: false });
    }
    if (row.birth_order != null && row.birth_order !== person.birth_order) {
      out.push({
        field: "birth_order",
        label: "Birth order",
        source: String(row.birth_order),
        tree: person.birth_order == null ? "—" : String(person.birth_order),
        treeEmpty: person.birth_order == null,
      });
    }
    if (row.living_status && row.living_status !== person.living_status) {
      out.push({
        field: "living_status",
        label: "Living status",
        source: row.living_status,
        tree: person.living_status,
        treeEmpty: person.living_status === "unknown",
      });
    }
    return out;
  }

  childrenMissingInTree(row: TempRow, person: PersonRow): string[] {
    const treeChildren = (this.childrenOf.get(person.id) ?? []).map((id) => this.personById.get(id)?.full_name ?? "");
    return splitNames(row.children_names).filter((name) => !treeChildren.some((tc) => nameSimilarity(name, tc) >= 0.7));
  }

  addPlan(row: TempRow): AddPlan {
    const gender = this.inferGender(row);
    const spouseName = row.spouse_name;
    const plan: AddPlan = {
      ready: false,
      blocker: null,
      fatherId: null,
      motherId: null,
      fatherName: null,
      motherName: null,
      notes: [],
      gender,
      spouseToAdd: spouseName,
      spouseCandidates: spouseName ? this.candidates(spouseName, 2, 0.75) : [],
    };

    if (row.review_status !== "pending") {
      plan.blocker = "Already handled";
      return plan;
    }

    const parentId = parentShaheenId(row.shaheen_id);
    if (!parentId) {
      plan.ready = true;
      plan.notes.push("Top of the source tree — no parents will be linked.");
      return plan;
    }
    const parentRow = this.tempById.get(parentId);
    if (!parentRow) {
      plan.ready = true;
      plan.notes.push(`No parent row ${parentId} in the source — no parents will be linked.`);
      return plan;
    }
    const parentPersonId = this.resolvedPersonId(parentRow);
    if (!parentPersonId) {
      plan.blocker =
        parentRow.review_status === "skipped"
          ? `Their parent "${parentRow.full_name}" was skipped`
          : `Add or confirm their parent first: "${parentRow.full_name}" (${parentRow.shaheen_id})`;
      return plan;
    }
    const parent = this.personById.get(parentPersonId);
    if (!parent) {
      plan.blocker = `Their parent "${parentRow.full_name}" isn't loaded yet — reload the page`;
      return plan;
    }

    // Is the (blood-line) parent this person's father or mother?
    let slot: "father" | "mother" | null = parent.gender === "M" ? "father" : parent.gender === "F" ? "mother" : null;
    if (!slot) {
      const kids = (this.childrenOf.get(parent.id) ?? []).map((id) => this.personById.get(id));
      const asFather = kids.filter((k) => k?.father_id === parent.id).length;
      const asMother = kids.filter((k) => k?.mother_id === parent.id).length;
      if (asFather > asMother) slot = "father";
      else if (asMother > asFather) slot = "mother";
    }
    if (!slot) {
      const sf = nameSimilarity(row.father_name, parentRow.full_name);
      const sm = nameSimilarity(row.mother_name, parentRow.full_name);
      if (sf >= 0.5 && sf > sm) slot = "father";
      else if (sm >= 0.5 && sm > sf) slot = "mother";
    }
    if (!slot) {
      plan.blocker = `Can't tell whether "${parent.full_name}" is the father or the mother`;
      return plan;
    }

    const otherSourceName = slot === "father" ? row.mother_name : row.father_name;
    let otherId: string | null = null;
    const parentSpouses = this.spousesOf.get(parent.id) ?? [];
    if (parentSpouses.length === 1) {
      otherId = parentSpouses[0];
    } else if (parentSpouses.length > 1 && otherSourceName) {
      const best = parentSpouses
        .map((id) => ({ id, score: nameSimilarity(otherSourceName, this.personById.get(id)?.full_name) }))
        .sort((a, b) => b.score - a.score)[0];
      if (best && best.score >= 0.6) otherId = best.id;
    }
    if (!otherId && otherSourceName) {
      plan.notes.push(
        `Other parent "${otherSourceName}" isn't linked as ${parent.full_name}'s spouse in the tree, so only the ${slot} will be linked.`,
      );
    }

    plan.fatherId = slot === "father" ? parent.id : otherId;
    plan.motherId = slot === "mother" ? parent.id : otherId;
    plan.fatherName = plan.fatherId ? (this.personById.get(plan.fatherId)?.full_name ?? null) : null;
    plan.motherName = plan.motherId ? (this.personById.get(plan.motherId)?.full_name ?? null) : null;
    plan.ready = true;
    return plan;
  }

  view(row: TempRow): RowView {
    const matchedPerson = row.matched_people_id ? (this.personById.get(row.matched_people_id) ?? null) : null;
    const parentRow = this.tempById.get(parentShaheenId(row.shaheen_id) ?? "");
    const isPending = row.review_status === "pending";
    return {
      shaheenId: row.shaheen_id,
      fullName: row.full_name,
      birthOrder: row.birth_order,
      livingStatus: row.living_status,
      matchStatus: row.match_status,
      reviewStatus: row.review_status,
      resolvedPersonId: row.resolved_people_id,
      resolvedPersonName: row.resolved_people_id ? (this.personById.get(row.resolved_people_id)?.full_name ?? null) : null,
      sourceFather: row.father_name,
      sourceMother: row.mother_name,
      sourceSpouse: row.spouse_name,
      sourceChildren: splitNames(row.children_names),
      parentLabel: parentRow ? `${parentRow.full_name} (${parentRow.shaheen_id})` : null,
      matched: matchedPerson ? this.snapshot(matchedPerson.id) : null,
      diffs: matchedPerson && isPending ? this.diffs(row, matchedPerson) : [],
      childrenMissingInTree: matchedPerson && isPending ? this.childrenMissingInTree(row, matchedPerson) : [],
      candidates: !matchedPerson && isPending ? this.candidates(row.full_name) : [],
      add: !matchedPerson && isPending ? this.addPlan(row) : null,
    };
  }
}
