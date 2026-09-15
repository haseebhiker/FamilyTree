"use client";

import { useMemo, useState } from "react";
import { PersonName, displayNameText } from "@/components/person-name";

export interface PersonOption {
  id: string;
  full_name: string;
  surname_tag: string | null;
  preferred_name?: string | null;
}

/** A type-to-search combobox for picking one person out of a long list — submits `name` as a hidden input, since a plain <select> with 1000+ options isn't realistically searchable. */
export function PersonPicker({
  name,
  people,
  placeholder = "Search by name…",
  defaultPersonId,
}: {
  name: string;
  people: PersonOption[];
  placeholder?: string;
  defaultPersonId?: string;
}) {
  const defaultPerson = people.find((p) => p.id === defaultPersonId);
  const [query, setQuery] = useState(defaultPerson ? displayNameText(defaultPerson) : "");
  const [selectedId, setSelectedId] = useState(defaultPersonId ?? "");
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    if (query.trim().length < 1) return [];
    const q = query.trim().toLowerCase();
    return people.filter((p) => displayNameText(p).toLowerCase().includes(q)).slice(0, 20);
  }, [query, people]);

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selectedId} />
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedId("");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />
      {selectedId && (
        <span className="absolute top-2.5 right-2 text-xs text-green-600" title="Selected">
          ✓
        </span>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setSelectedId(p.id);
                  setQuery(displayNameText(p));
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <PersonName person={p} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
