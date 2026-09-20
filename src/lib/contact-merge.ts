import type { ParsedContact } from "@/lib/vcard";

export interface MergedContact extends ParsedContact {
  /** Other names the same person was saved under in the merged duplicates. */
  alsoNamed: string[];
  /** How many separate entries in the file were folded into this one. */
  dupCount: number;
}

const nameKey = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^\p{L}]/gu, "");
const phoneKey = (v: string) => {
  const digits = v.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
};

/**
 * A big contacts file usually holds the same people several times over
 * (iCloud + Google + SIM copies). Entries are folded together only when they
 * have the SAME name AND share a phone number or email — same name with
 * completely different numbers stays separate, because in this family several
 * different people really do share a name, and two people sharing a home
 * landline must never be merged just for that.
 */
export function mergeContacts(list: ParsedContact[]): MergedContact[] {
  const groups = new Map<string, number[]>();
  list.forEach((c, i) => {
    const k = nameKey(c.name) || `__${i}`;
    const g = groups.get(k);
    if (g) g.push(i);
    else groups.set(k, [i]);
  });

  const out: MergedContact[] = [];
  for (const idxs of groups.values()) {
    const parent = new Map<number, number>(idxs.map((i) => [i, i]));
    const find = (x: number): number => {
      let r = x;
      while (parent.get(r) !== r) r = parent.get(r)!;
      parent.set(x, r);
      return r;
    };
    const owner = new Map<string, number>();
    for (const i of idxs) {
      const keys = [
        ...list[i].phones.map((p) => `p:${phoneKey(p.value)}`),
        ...list[i].emails.map((e) => `e:${e.value.trim().toLowerCase()}`),
      ];
      for (const key of keys) {
        const o = owner.get(key);
        if (o === undefined) owner.set(key, i);
        else parent.set(find(i), find(o));
      }
    }
    const comps = new Map<number, number[]>();
    for (const i of idxs) {
      const r = find(i);
      const c = comps.get(r);
      if (c) c.push(i);
      else comps.set(r, [i]);
    }
    for (const members of comps.values()) {
      const contacts = members.map((i) => list[i]);
      const name = contacts.map((c) => c.name).sort((a, b) => b.length - a.length)[0];
      const alsoNamed = [...new Set(contacts.map((c) => c.name).filter((n) => n !== name))];
      const phones = new Map<string, ParsedContact["phones"][number]>();
      const emails = new Map<string, ParsedContact["emails"][number]>();
      for (const c of contacts) {
        for (const p of c.phones) {
          const k = phoneKey(p.value);
          const have = phones.get(k);
          if (!have || (!have.value.startsWith("+") && p.value.startsWith("+"))) phones.set(k, p);
        }
        for (const e of c.emails) emails.set(e.value.trim().toLowerCase(), e);
      }
      out.push({
        name,
        org: contacts.find((c) => c.org)?.org ?? null,
        title: contacts.find((c) => c.title)?.title ?? null,
        nickname: contacts.find((c) => c.nickname)?.nickname ?? null,
        note: contacts.find((c) => c.note)?.note ?? null,
        phones: [...phones.values()],
        emails: [...emails.values()],
        alsoNamed,
        dupCount: contacts.length,
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
