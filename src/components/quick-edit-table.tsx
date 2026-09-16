"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { submitPersonEdit } from "@/lib/actions/pending-changes";
import { Input, Select } from "@/components/ui";
import { PersonName, displayNameText } from "@/components/person-name";
import { PersonPicker } from "@/components/person-picker";

export interface QuickEditPerson {
  id: string;
  full_name: string;
  preferred_name: string | null;
  surname_tag: string | null;
  gender: "M" | "F" | null;
  living_status: "living" | "deceased" | "unknown";
  birth_year: number | null;
  birth_month: number | null;
  birth_day: number | null;
  birth_order: number | null;
  father_id: string | null;
  mother_id: string | null;
}

type ColumnKey = "preferred_name" | "gender" | "living_status" | "birth_date" | "birth_order";

const COLUMN_LABELS: Record<ColumnKey, string> = {
  preferred_name: "Preferred name",
  gender: "Gender",
  living_status: "Living status",
  birth_date: "Date of birth",
  birth_order: "Birth order",
};

const DEFAULT_ORDER: ColumnKey[] = ["preferred_name", "gender", "living_status", "birth_date", "birth_order"];

const isMissing: Record<ColumnKey, (p: QuickEditPerson) => boolean> = {
  preferred_name: (p) => !p.preferred_name,
  gender: (p) => !p.gender,
  living_status: (p) => !p.living_status || p.living_status === "unknown",
  birth_date: (p) => !p.birth_year,
  // Only worth flagging as "missing" when the year is missing too — if the
  // exact year is already known, birth_order isn't needed for sorting.
  birth_order: (p) => !p.birth_year && !p.birth_order,
};

const cellInputClass = "px-2 py-1 text-xs";

export function QuickEditTable({ initialPeople }: { initialPeople: QuickEditPerson[] }) {
  const [people, setPeople] = useState(initialPeople);
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(DEFAULT_ORDER);
  const [visible, setVisible] = useState<Record<ColumnKey, boolean>>({
    preferred_name: true,
    gender: true,
    living_status: true,
    birth_date: true,
    birth_order: true,
  });
  const [missingFilter, setMissingFilter] = useState<ColumnKey | "none">("none");
  const [branchRoot, setBranchRoot] = useState<{ id: string; name: string } | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [errorIds, setErrorIds] = useState<Record<string, string>>({});

  // Every child listed under BOTH parents that are in the data (a child
  // with two parents recorded would otherwise only be reachable from
  // whichever parent's id happens to be checked first) — descendants are
  // collected into a Set, so being reachable from two directions just
  // means it's visited once and skipped the second time, never a dupe.
  const childrenByParent = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of people) {
      for (const parentId of [p.father_id, p.mother_id]) {
        if (!parentId) continue;
        const list = map.get(parentId);
        if (list) list.push(p.id);
        else map.set(parentId, [p.id]);
      }
    }
    return map;
  }, [people]);

  const branchIds = useMemo(() => {
    if (!branchRoot) return null;
    const ids = new Set<string>([branchRoot.id]);
    const queue = [branchRoot.id];
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const childId of childrenByParent.get(current) ?? []) {
        if (ids.has(childId)) continue;
        ids.add(childId);
        queue.push(childId);
      }
    }
    return ids;
  }, [branchRoot, childrenByParent]);

  const filtered = useMemo(() => {
    let result = people;
    if (branchIds) result = result.filter((p) => branchIds.has(p.id));
    if (missingFilter !== "none") result = result.filter(isMissing[missingFilter]);
    return result;
  }, [people, missingFilter, branchIds]);

  function moveColumn(key: ColumnKey, dir: -1 | 1) {
    setColumnOrder((order) => {
      const idx = order.indexOf(key);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= order.length) return order;
      const copy = [...order];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  }

  async function save(personId: string, fields: Record<string, string>, patch: Partial<QuickEditPerson>) {
    setSavingIds((s) => new Set(s).add(personId));
    setErrorIds((e) => {
      const copy = { ...e };
      delete copy[personId];
      return copy;
    });
    const formData = new FormData();
    formData.set("person_id", personId);
    for (const [k, v] of Object.entries(fields)) formData.set(k, v);
    try {
      const applied = await submitPersonEdit(formData, { skipRevalidate: true });
      if (applied) {
        // Admin: this IS now the real value — reflect it, and the "missing"
        // filter above correctly drops the row.
        setPeople((ps) => ps.map((p) => (p.id === personId ? { ...p, ...patch } : p)));
        setSavedIds((s) => new Set(s).add(personId));
        setTimeout(() => {
          setSavedIds((s) => {
            const copy = new Set(s);
            copy.delete(personId);
            return copy;
          });
        }, 2000);
      } else {
        // Non-admin: queued for review, not actually changed yet — leaving
        // `people` untouched keeps the "missing" filter honest (the field
        // really is still missing until an admin approves it) instead of
        // the row quietly vanishing as if it were already done.
        setPendingIds((s) => new Set(s).add(personId));
      }
    } catch (e) {
      setErrorIds((errs) => ({ ...errs, [personId]: e instanceof Error ? e.message : "Failed to save" }));
    } finally {
      setSavingIds((s) => {
        const copy = new Set(s);
        copy.delete(personId);
        return copy;
      });
    }
  }

  const visibleColumns = columnOrder.filter((k) => visible[k]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="w-64">
          <label className="mb-1 block text-xs font-medium text-slate-600">Family branch:</label>
          <PersonPicker
            name="branch_root"
            people={people}
            placeholder="Search for a person…"
            onSelect={(id, person) => setBranchRoot(person ? { id, name: displayNameText(person) } : null)}
          />
        </div>
        {branchRoot && (
          <div className="flex items-center gap-2 pb-2 text-xs text-slate-600">
            <span>
              Showing <span className="font-medium">{branchRoot.name}</span> and everyone under them (
              {branchIds?.size ?? 0} {branchIds?.size === 1 ? "person" : "people"})
            </span>
            <button type="button" onClick={() => setBranchRoot(null)} className="text-red-600 hover:underline">
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">Show only missing:</label>
          <Select
            value={missingFilter}
            onChange={(e) => setMissingFilter(e.target.value as ColumnKey | "none")}
            className="w-auto px-2 py-1 text-xs"
          >
            <option value="none">Everyone ({(branchIds ? people.filter((p) => branchIds.has(p.id)) : people).length})</option>
            {DEFAULT_ORDER.map((key) => (
              <option key={key} value={key}>
                {COLUMN_LABELS[key]} (
                {(branchIds ? people.filter((p) => branchIds.has(p.id)) : people).filter(isMissing[key]).length} missing)
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-l border-slate-300 pl-4">
          <span className="text-xs font-medium text-slate-600">Columns:</span>
          {columnOrder.map((key, i) => (
            <div key={key} className="flex items-center gap-0.5 text-xs text-slate-600">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={visible[key]}
                  onChange={(e) => setVisible((v) => ({ ...v, [key]: e.target.checked }))}
                />
                {COLUMN_LABELS[key]}
              </label>
              <button
                type="button"
                onClick={() => moveColumn(key, -1)}
                disabled={i === 0}
                className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                aria-label={`Move ${COLUMN_LABELS[key]} left`}
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => moveColumn(key, 1)}
                disabled={i === columnOrder.length - 1}
                className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                aria-label={`Move ${COLUMN_LABELS[key]} right`}
              >
                ▶
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <th className="py-2 px-3 font-medium">Name</th>
              {visibleColumns.map((key) => (
                <th key={key} className="py-2 px-3 font-medium">
                  {COLUMN_LABELS[key]}
                  {key === "birth_order" && (
                    <span
                      className="ml-1 cursor-help text-slate-400"
                      title="Which child they are among their siblings (1 = firstborn) — only used to sort when the exact birth year above isn't known."
                    >
                      ⓘ
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="whitespace-nowrap py-1.5 px-3">
                  <Link href={`/people/${p.id}`} className="hover:underline" target="_blank">
                    <PersonName person={p} />
                  </Link>
                  {savingIds.has(p.id) && <span className="ml-2 text-xs text-slate-400">saving…</span>}
                  {savedIds.has(p.id) && <span className="ml-2 text-xs font-medium text-green-600">✓ saved</span>}
                  {pendingIds.has(p.id) && (
                    <span className="ml-2 text-xs font-medium text-amber-600">⏳ submitted for review</span>
                  )}
                  {errorIds[p.id] && <span className="ml-2 text-xs text-red-600">{errorIds[p.id]}</span>}
                </td>
                {visibleColumns.map((key) => (
                  <td key={key} className="py-1.5 px-3">
                    {key === "preferred_name" && (
                      <Input
                        defaultValue={p.preferred_name ?? ""}
                        placeholder="—"
                        className={cellInputClass}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value === (p.preferred_name ?? "")) return;
                          save(p.id, { preferred_name: value }, { preferred_name: value || null });
                        }}
                      />
                    )}
                    {key === "gender" && (
                      <Select
                        defaultValue={p.gender ?? ""}
                        className={cellInputClass}
                        onChange={(e) => {
                          const value = e.target.value;
                          save(p.id, { gender: value }, { gender: (value || null) as "M" | "F" | null });
                        }}
                      >
                        <option value="">Unknown</option>
                        <option value="M">Male</option>
                        <option value="F">Female</option>
                      </Select>
                    )}
                    {key === "living_status" && (
                      <Select
                        defaultValue={p.living_status}
                        className={cellInputClass}
                        onChange={(e) => {
                          const value = e.target.value;
                          save(p.id, { living_status: value }, { living_status: value as QuickEditPerson["living_status"] });
                        }}
                      >
                        <option value="unknown">Unknown</option>
                        <option value="living">Living</option>
                        <option value="deceased">Deceased</option>
                      </Select>
                    )}
                    {key === "birth_date" && (
                      <div className="flex gap-1">
                        <Input
                          type="number"
                          placeholder="Year"
                          defaultValue={p.birth_year ?? ""}
                          className={`${cellInputClass} w-16`}
                          onBlur={(e) => {
                            const value = e.target.value.trim();
                            const year = value ? Number(value) : null;
                            if (year === p.birth_year) return;
                            save(
                              p.id,
                              {
                                birth_year: value,
                                birth_month: p.birth_month?.toString() ?? "",
                                birth_day: p.birth_day?.toString() ?? "",
                              },
                              { birth_year: year },
                            );
                          }}
                        />
                        <Input
                          type="number"
                          placeholder="Mo"
                          min={1}
                          max={12}
                          defaultValue={p.birth_month ?? ""}
                          className={`${cellInputClass} w-14`}
                          onBlur={(e) => {
                            const value = e.target.value.trim();
                            const month = value ? Number(value) : null;
                            if (month === p.birth_month) return;
                            save(
                              p.id,
                              {
                                birth_year: p.birth_year?.toString() ?? "",
                                birth_month: value,
                                birth_day: p.birth_day?.toString() ?? "",
                              },
                              { birth_month: month },
                            );
                          }}
                        />
                        <Input
                          type="number"
                          placeholder="Day"
                          min={1}
                          max={31}
                          defaultValue={p.birth_day ?? ""}
                          className={`${cellInputClass} w-14`}
                          onBlur={(e) => {
                            const value = e.target.value.trim();
                            const day = value ? Number(value) : null;
                            if (day === p.birth_day) return;
                            save(
                              p.id,
                              {
                                birth_year: p.birth_year?.toString() ?? "",
                                birth_month: p.birth_month?.toString() ?? "",
                                birth_day: value,
                              },
                              { birth_day: day },
                            );
                          }}
                        />
                      </div>
                    )}
                    {key === "birth_order" && (
                      <Input
                        type="number"
                        min={1}
                        placeholder="e.g. 2"
                        defaultValue={p.birth_order ?? ""}
                        className={`${cellInputClass} w-16`}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          const order = value ? Number(value) : null;
                          if (order === p.birth_order) return;
                          save(p.id, { birth_order: value }, { birth_order: order });
                        }}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="py-6 text-center text-slate-400">
                  Nobody matches this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
