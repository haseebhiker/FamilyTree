"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { PersonPicker, type PersonOption } from "@/components/person-picker";
import { displayNameText } from "@/components/person-name";
import { parseVCards, type ParsedContact } from "@/lib/vcard";
import { buildIndex, candidatesFor } from "@/lib/contact-match";
import { importContacts, type ImportItem } from "@/lib/actions/contact-import";

export type PickerPerson = PersonOption & { other_names: string | null };

type Filter = "likely" | "other" | "selected";

const PAGE = 100;

export function ContactImport({ people }: { people: PickerPerson[] }) {
  const [contacts, setContacts] = useState<ParsedContact[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [include, setInclude] = useState<Set<number>>(new Set());
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [searching, setSearching] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<Filter>("likely");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const index = useMemo(() => buildIndex(people), [people]);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const cands = useMemo(() => (contacts ? contacts.map((c) => candidatesFor(c.name, index)) : []), [contacts, index]);

  async function handleFile(file: File) {
    setError(null);
    setMessage(null);
    const text = await file.text();
    const parsed = parseVCards(text);
    if (parsed.length === 0) {
      setError("I couldn't find any contacts with a phone number or email in that file. It should be a .vcf (vCard) export.");
      return;
    }
    const inc = new Set<number>();
    const ch: Record<number, string> = {};
    parsed.forEach((c, i) => {
      const cs = candidatesFor(c.name, index);
      if (cs.length > 0) ch[i] = people[cs[0].personIdx].id;
      const strong = cs[0] && cs[0].score >= 0.85 && (!cs[1] || cs[0].score - cs[1].score >= 0.08);
      if (strong) inc.add(i);
    });
    setFileName(file.name);
    setContacts(parsed);
    setInclude(inc);
    setChoice(ch);
    setSaved(new Set());
    setSearching(new Set());
    setFilter("likely");
    setShown(PAGE);
  }

  const likelyIdx = useMemo(
    () => (contacts ? contacts.map((_, i) => i).filter((i) => (cands[i]?.[0]?.score ?? 0) >= 0.6) : []),
    [contacts, cands],
  );
  const otherIdx = useMemo(() => {
    if (!contacts) return [];
    const likely = new Set(likelyIdx);
    return contacts.map((_, i) => i).filter((i) => !likely.has(i));
  }, [contacts, likelyIdx]);

  const visible = useMemo(() => {
    if (!contacts) return [];
    let list = filter === "likely" ? likelyIdx : filter === "other" ? otherIdx : [...include].sort((a, b) => a - b);
    list = list.filter((i) => !saved.has(i));
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((i) => contacts[i].name.toLowerCase().includes(q));
    return list;
  }, [contacts, filter, likelyIdx, otherIdx, include, saved, query]);

  const readyToSave = [...include].filter((i) => choice[i] && !saved.has(i));

  function toggle(i: number, on: boolean) {
    setInclude((s) => {
      const copy = new Set(s);
      if (on) copy.add(i);
      else copy.delete(i);
      return copy;
    });
  }

  function selectAllLikely() {
    setInclude((s) => {
      const copy = new Set(s);
      for (const i of likelyIdx) if (choice[i] && !saved.has(i)) copy.add(i);
      return copy;
    });
  }

  async function save() {
    if (!contacts) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      // One profile can come from several contacts (a person saved twice) — merge them.
      const byPerson = new Map<string, { item: ImportItem; contactIdx: number[] }>();
      for (const i of readyToSave) {
        const pid = choice[i];
        const entry = byPerson.get(pid) ?? { item: { personId: pid, phones: [], emails: [] }, contactIdx: [] };
        entry.item.phones.push(...contacts[i].phones);
        entry.item.emails.push(...contacts[i].emails);
        entry.contactIdx.push(i);
        byPerson.set(pid, entry);
      }
      const entries = [...byPerson.values()];
      let added = 0;
      let duplicates = 0;
      const invalid: string[] = [];
      const done = new Set(saved);
      for (let start = 0; start < entries.length; start += 100) {
        const batch = entries.slice(start, start + 100);
        const res = await importContacts(batch.map((b) => b.item));
        if ("error" in res) {
          setError(res.error);
          setSaved(done);
          return;
        }
        added += res.added;
        duplicates += res.duplicates;
        invalid.push(...res.invalid);
        for (const b of batch) for (const i of b.contactIdx) done.add(i);
      }
      setSaved(done);
      setInclude((s) => new Set([...s].filter((i) => !done.has(i))));
      setMessage(
        `Saved ${added} new number${added === 1 ? "" : "s"}/email${added === 1 ? "" : "s"} to ${entries.length} ${entries.length === 1 ? "person" : "people"}.` +
          (duplicates > 0 ? ` ${duplicates} were already on their profile and were skipped.` : "") +
          (invalid.length > 0 ? ` ${invalid.length} didn't look like valid numbers/emails and were skipped: ${invalid.slice(0, 6).join(", ")}${invalid.length > 6 ? "…" : ""}` : ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!contacts) {
    return (
      <div className="space-y-3">
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-10 text-center hover:bg-slate-50">
          <span className="text-sm font-medium text-slate-900">Choose your contacts file (.vcf)</span>
          <span className="mt-1 text-xs text-slate-500">It is read in this browser only. Nothing is saved until you tick contacts and press Save.</span>
          <input
            type="file"
            accept=".vcf,text/vcard,text/x-vcard,text/directory"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </label>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>
          <b className="text-slate-900">{contacts.length}</b> contacts in {fileName} &middot; {likelyIdx.length} look like family &middot;{" "}
          {saved.size} saved
        </span>
        <button type="button" className="text-xs font-medium text-slate-500 hover:underline" onClick={() => setContacts(null)}>
          Choose a different file
        </button>
      </div>

      {message && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["likely", `Likely family (${likelyIdx.filter((i) => !saved.has(i)).length})`],
            ["other", `Everyone else (${otherIdx.filter((i) => !saved.has(i)).length})`],
            ["selected", `Selected (${readyToSave.length})`],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setFilter(key);
              setShown(PAGE);
            }}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
              filter === key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
        {filter === "likely" && (
          <button type="button" onClick={selectAllLikely} className="text-xs font-medium text-blue-700 hover:underline">
            Tick all likely family
          </button>
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search these contacts…"
          className="ml-auto w-44 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>

      <div className="sticky top-0 z-10 -mx-1 flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
        <span className="text-sm text-slate-600">
          {readyToSave.length} ticked &mdash; saved as <b>admin-only</b>
        </span>
        <Button type="button" disabled={busy || readyToSave.length === 0} onClick={save}>
          {busy ? "Saving…" : `Save ${readyToSave.length} to the tree`}
        </Button>
      </div>

      <div className="space-y-2">
        {visible.slice(0, shown).map((i) => {
          const c = contacts[i];
          const cs = cands[i] ?? [];
          const chosenId = choice[i] ?? "";
          const chosen = chosenId ? peopleById.get(chosenId) : undefined;
          const inList = cs.some((x) => people[x.personIdx].id === chosenId);
          return (
            <div key={i} className={`rounded-lg border bg-white p-3 ${include.has(i) ? "border-green-300" : "border-slate-200"}`}>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={include.has(i)}
                  disabled={!chosenId}
                  onChange={(e) => toggle(i, e.target.checked)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">{c.name}</span>
                  <span className="block break-words text-xs text-slate-500">
                    {[...c.phones.map((p) => p.value), ...c.emails.map((e) => e.value)].join("  ·  ")}
                  </span>
                </span>
              </label>
              <div className="mt-2 pl-7">
                <select
                  value={searching.has(i) ? "__search" : chosenId}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__search") {
                      setSearching((s) => new Set(s).add(i));
                    } else {
                      setSearching((s) => {
                        const copy = new Set(s);
                        copy.delete(i);
                        return copy;
                      });
                      setChoice((ch) => ({ ...ch, [i]: v }));
                      if (!v) toggle(i, false);
                    }
                  }}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">{cs.length ? "Not family / skip" : "Not in the tree — skip"}</option>
                  {cs.map((x) => {
                    const p = people[x.personIdx];
                    return (
                      <option key={p.id} value={p.id}>
                        {displayNameText(p)} {p.public_no != null ? `#${p.public_no}` : ""} — {Math.round(x.score * 100)}% match
                      </option>
                    );
                  })}
                  {chosen && !inList && (
                    <option value={chosen.id}>
                      {displayNameText(chosen)} {chosen.public_no != null ? `#${chosen.public_no}` : ""} (picked)
                    </option>
                  )}
                  <option value="__search">Search for someone else…</option>
                </select>
                {searching.has(i) && (
                  <div className="mt-2 max-w-md">
                    <PersonPicker
                      name={`pick-${i}`}
                      people={people}
                      placeholder="Type a name or a Person #…"
                      autoFocus
                      onSelect={(id) => {
                        if (!id) return;
                        setChoice((ch) => ({ ...ch, [i]: id }));
                        toggle(i, true);
                        setSearching((s) => {
                          const copy = new Set(s);
                          copy.delete(i);
                          return copy;
                        });
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {visible.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Nothing here.</p>}
        {visible.length > shown && (
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="w-full rounded-md border border-slate-300 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Show {Math.min(PAGE, visible.length - shown)} more ({visible.length - shown} left)
          </button>
        )}
      </div>
    </div>
  );
}
