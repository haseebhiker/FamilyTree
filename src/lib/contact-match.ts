import { nameSimilarity } from "@/lib/import-review";

export interface MatchablePerson {
  full_name: string;
  preferred_name?: string | null;
  surname_tag: string | null;
  other_names: string | null;
}

export interface Candidate {
  personIdx: number;
  score: number;
}

export const tokensOf = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 2);

/** Which tree people a contact's name might be, without comparing every contact to every person: only people sharing a word-start with the contact's name are scored. */
export function buildIndex(people: MatchablePerson[]) {
  const variants: string[][] = [];
  const prefix = new Map<string, number[]>();
  people.forEach((p, i) => {
    const v = new Set<string>([p.full_name]);
    const pref = p.preferred_name?.trim();
    if (pref) {
      v.add(pref);
      if (p.surname_tag) v.add(`${pref} ${p.surname_tag}`);
    }
    for (const o of (p.other_names ?? "").split(/[;,/]/)) if (o.trim()) v.add(o.trim());
    variants.push([...v]);
    const seen = new Set<string>();
    for (const name of v) {
      for (const t of tokensOf(name)) {
        const k = t.slice(0, 3);
        if (seen.has(k)) continue;
        seen.add(k);
        const list = prefix.get(k);
        if (list) list.push(i);
        else prefix.set(k, [i]);
      }
    }
  });
  return { variants, prefix };
}

export function candidatesFor(name: string, idx: ReturnType<typeof buildIndex>): Candidate[] {
  const toks = tokensOf(name);
  if (toks.length === 0) return [];
  const hits = new Set<number>();
  for (const t of toks) for (const i of idx.prefix.get(t.slice(0, 3)) ?? []) hits.add(i);
  const single = toks.length === 1;
  const scored: Candidate[] = [];
  for (const i of hits) {
    let best = 0;
    for (const v of idx.variants[i]) {
      const vt = tokensOf(v);
      // The contact's first word must resemble one of the person's first few words (a nickname in brackets, e.g. "Kifayathulla(Kif)Mohamed", counts).
      if (vt.length === 0 || !vt.slice(0, 3).some((t) => nameSimilarity(toks[0], t) >= 0.6)) continue;
      const s = nameSimilarity(name, v) * (single ? 0.85 : 1);
      if (s > best) best = s;
    }
    if (best >= 0.6) scored.push({ personIdx: i, score: best });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
}

