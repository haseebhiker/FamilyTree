"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { PersonPicker, type PersonOption } from "@/components/person-picker";
import { nameSimilarity, type RowView, type PersonSnapshot } from "@/lib/import-review";
import {
  addTempPerson,
  confirmTempMatch,
  rematchTempPerson,
  skipTempPerson,
  unmatchTempPerson,
} from "@/lib/actions/import-review";

type Filter = "todo" | "matched" | "missing" | "done" | "all";
type Result = { ok: true } | { error: string };

const FILTERS: { key: Filter; label: string }[] = [
  { key: "todo", label: "To review" },
  { key: "matched", label: "Matches" },
  { key: "missing", label: "Not in tree" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
];

function isMatchRow(r: RowView) {
  return r.reviewStatus === "pending" && !!r.matched;
}
function isMissingRow(r: RowView) {
  return r.reviewStatus === "pending" && !r.matched;
}

function StatusBadge({ row }: { row: RowView }) {
  const base = "rounded-full px-2 py-0.5 text-[10px] font-medium";
  if (row.reviewStatus === "added") return <span className={`${base} bg-green-100 text-green-800`}>Added</span>;
  if (row.reviewStatus === "confirmed") return <span className={`${base} bg-green-100 text-green-800`}>Confirmed</span>;
  if (row.reviewStatus === "skipped") return <span className={`${base} bg-slate-200 text-slate-600`}>Skipped</span>;
  if (row.matched) {
    return row.matchStatus === "MATCHED_EXACT" ? (
      <span className={`${base} bg-blue-100 text-blue-800`}>Exact match</span>
    ) : (
      <span className={`${base} bg-amber-100 text-amber-800`}>Possible match</span>
    );
  }
  return <span className={`${base} bg-red-100 text-red-700`}>Not in tree</span>;
}

function CompareRow({ label, source, tree, differs }: { label: string; source: string; tree: string; differs: boolean }) {
  return (
    <tr className={differs ? "bg-amber-50" : ""}>
      <td className="py-1 pr-3 align-top text-xs font-medium text-slate-500">{label}</td>
      <td className="py-1 pr-3 align-top text-sm text-slate-800">{source || "—"}</td>
      <td className="py-1 align-top text-sm text-slate-800">{tree || "—"}</td>
    </tr>
  );
}

function similar(a: string | null, b: string | null) {
  if (!a && !b) return true;
  return nameSimilarity(a, b) >= 0.7;
}

function SnapshotLine({ s }: { s: PersonSnapshot }) {
  const bits = [
    s.fatherName && `father ${s.fatherName}`,
    s.motherName && `mother ${s.motherName}`,
    s.spouses.length > 0 && `spouse ${s.spouses.join(", ")}`,
    s.children.length > 0 && `${s.children.length} ${s.children.length === 1 ? "child" : "children"}`,
  ].filter(Boolean);
  return (
    <span className="text-xs text-slate-500">
      {s.surnameTag && <span className="mr-1 font-medium text-amber-700">{s.surnameTag}</span>}
      {bits.length > 0 ? bits.join(" · ") : "no relatives recorded"}
    </span>
  );
}

function RowCard({ row, people, disabled }: { row: RowView; people: PersonOption[]; disabled: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [apply, setApply] = useState<Set<string>>(
    () => new Set(row.diffs.filter((d) => d.treeEmpty).map((d) => d.field)),
  );
  const [addSpouse, setAddSpouse] = useState(() => !!row.add?.spouseToAdd && (row.add?.spouseCandidates.length ?? 0) === 0);

  function run(action: () => Promise<Result>) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await action();
        if ("error" in res) setError(res.error);
        else router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong — please try again.");
      }
    });
  }

  const busy = isPending || disabled;
  const finished = row.reviewStatus === "added" || row.reviewStatus === "confirmed";

  return (
    <details className="group rounded-lg border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5">
        <span className="w-16 shrink-0 text-xs text-slate-400">{row.shaheenId}</span>
        <span className="flex-1 text-sm font-medium text-slate-900">{row.fullName}</span>
        <StatusBadge row={row} />
      </summary>
      <div className="space-y-3 border-t border-slate-100 p-3">
        {row.parentLabel && <p className="text-xs text-slate-500">Child of {row.parentLabel} in the source</p>}

        {finished && row.resolvedPersonId && (
          <p className="text-sm text-slate-700">
            {row.reviewStatus === "added" ? "Added to the tree as " : "Matched to "}
            <Link href={`/people/${row.resolvedPersonId}`} target="_blank" className="font-medium text-blue-700 hover:underline">
              {row.resolvedPersonName ?? "this person"}
            </Link>
            .
          </p>
        )}

        {row.reviewStatus === "skipped" && (
          <Button type="button" disabled={busy} onClick={() => run(() => skipTempPerson(row.shaheenId, false))}>
            Undo skip
          </Button>
        )}

        {row.matched && row.reviewStatus === "pending" && (
          <>
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs text-slate-400">
                  <th className="w-24 pb-1 font-medium"></th>
                  <th className="pb-1 pr-3 font-medium">Source (temp_people)</th>
                  <th className="pb-1 font-medium">
                    In the tree —{" "}
                    <Link href={`/people/${row.matched.id}`} target="_blank" className="text-blue-700 hover:underline">
                      open profile
                    </Link>
                  </th>
                </tr>
              </thead>
              <tbody>
                <CompareRow
                  label="Name"
                  source={row.fullName}
                  tree={row.matched.fullName}
                  differs={row.diffs.some((d) => d.field === "full_name")}
                />
                <CompareRow
                  label="Birth order"
                  source={row.birthOrder == null ? "" : String(row.birthOrder)}
                  tree={row.matched.birthOrder == null ? "" : String(row.matched.birthOrder)}
                  differs={row.diffs.some((d) => d.field === "birth_order")}
                />
                <CompareRow
                  label="Living status"
                  source={row.livingStatus ?? ""}
                  tree={row.matched.livingStatus}
                  differs={row.diffs.some((d) => d.field === "living_status")}
                />
                <CompareRow
                  label="Father"
                  source={row.sourceFather ?? ""}
                  tree={row.matched.fatherName ?? ""}
                  differs={!similar(row.sourceFather, row.matched.fatherName)}
                />
                <CompareRow
                  label="Mother"
                  source={row.sourceMother ?? ""}
                  tree={row.matched.motherName ?? ""}
                  differs={!similar(row.sourceMother, row.matched.motherName)}
                />
                <CompareRow
                  label="Spouse"
                  source={row.sourceSpouse ?? ""}
                  tree={row.matched.spouses.join(", ")}
                  differs={!!row.sourceSpouse && !row.matched.spouses.some((s) => similar(row.sourceSpouse, s))}
                />
                <CompareRow
                  label="Children"
                  source={row.sourceChildren.join(", ")}
                  tree={row.matched.children.join(", ")}
                  differs={row.childrenMissingInTree.length > 0}
                />
              </tbody>
            </table>
            {row.childrenMissingInTree.length > 0 && (
              <p className="text-xs text-amber-700">
                Not found under this person in the tree: {row.childrenMissingInTree.join(", ")}
              </p>
            )}

            {row.diffs.length > 0 && (
              <div className="rounded-md border border-slate-200 p-2">
                <p className="mb-1 text-xs font-medium text-slate-600">Update the tree with the source values?</p>
                {row.diffs.map((d) => (
                  <label key={d.field} className="flex items-center gap-2 py-0.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={apply.has(d.field)}
                      onChange={(e) =>
                        setApply((s) => {
                          const copy = new Set(s);
                          if (e.target.checked) copy.add(d.field);
                          else copy.delete(d.field);
                          return copy;
                        })
                      }
                    />
                    {d.label}: <span className="text-slate-400 line-through">{d.tree}</span> → <b>{d.source}</b>
                    {!d.treeEmpty && <span className="text-xs text-amber-700">(overwrites)</span>}
                  </label>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" disabled={busy} onClick={() => run(() => confirmTempMatch(row.shaheenId, [...apply]))}>
                {isPending ? "Working…" : apply.size > 0 ? `Confirm match & apply ${apply.size}` : "Confirm match"}
              </Button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => unmatchTempPerson(row.shaheenId))}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Not the same person
              </button>
            </div>
            <div className="max-w-sm">
              <p className="mb-1 text-xs text-slate-500">Or match a different person:</p>
              <PersonPicker
                name={`rematch-${row.shaheenId}`}
                people={people}
                placeholder="Search by name…"
                onSelect={(id) => id && run(() => rematchTempPerson(row.shaheenId, id))}
              />
            </div>
          </>
        )}

        {!row.matched && row.reviewStatus === "pending" && row.add && (
          <>
            <div className="text-sm text-slate-700">
              <p>
                <b>{row.fullName}</b>
                {row.birthOrder != null && <> · child #{row.birthOrder}</>}
                {row.livingStatus && <> · {row.livingStatus}</>}
              </p>
              <p className="text-xs text-slate-500">
                Source says: father {row.sourceFather ?? "—"} · mother {row.sourceMother ?? "—"} · spouse{" "}
                {row.sourceSpouse ?? "—"}
                {row.sourceChildren.length > 0 && <> · children {row.sourceChildren.join(", ")}</>}
              </p>
            </div>

            {row.candidates.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
                <p className="mb-1 text-xs font-medium text-amber-800">Already in the tree? Check before adding:</p>
                {row.candidates.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                    <div>
                      <Link href={`/people/${c.id}`} target="_blank" className="text-sm font-medium text-slate-900 hover:underline">
                        {c.fullName}
                      </Link>{" "}
                      <span className="text-xs text-slate-400">{Math.round(c.score * 100)}% similar</span>
                      <div>
                        <SnapshotLine s={c} />
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => rematchTempPerson(row.shaheenId, c.id))}
                      className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                    >
                      This is them
                    </button>
                  </div>
                ))}
              </div>
            )}

            {row.add.blocker ? (
              <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">{row.add.blocker}</p>
            ) : (
              <div className="space-y-2 rounded-md border border-slate-200 p-2">
                <p className="text-xs font-medium text-slate-600">If you approve, this will be added:</p>
                <ul className="list-disc pl-5 text-sm text-slate-700">
                  <li>
                    {row.fullName}
                    {row.add.gender && <> ({row.add.gender === "M" ? "male" : "female"}, worked out from their children)</>}
                  </li>
                  <li>Father: {row.add.fatherName ?? "not linked"}</li>
                  <li>Mother: {row.add.motherName ?? "not linked"}</li>
                </ul>
                {row.add.notes.map((n) => (
                  <p key={n} className="text-xs text-amber-700">
                    {n}
                  </p>
                ))}
                {row.add.spouseToAdd && (
                  <div>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={addSpouse} onChange={(e) => setAddSpouse(e.target.checked)} />
                      Also add spouse &ldquo;{row.add.spouseToAdd}&rdquo; as a new person and link them
                    </label>
                    {row.add.spouseCandidates.length > 0 && (
                      <p className="ml-6 text-xs text-amber-700">
                        Someone similar is already in the tree:{" "}
                        {row.add.spouseCandidates.map((c) => c.fullName).join(", ")} — check first.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy || !row.add.ready}
                onClick={() => run(() => addTempPerson(row.shaheenId, addSpouse))}
              >
                {isPending ? "Working…" : "Approve & add to tree"}
              </Button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => skipTempPerson(row.shaheenId, true))}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Skip
              </button>
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </details>
  );
}

export function ImportReviewList({
  rows,
  people,
  migrationNeeded,
}: {
  rows: RowView[];
  people: PersonOption[];
  migrationNeeded: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("todo");

  const counts = useMemo(
    () => ({
      todo: rows.filter((r) => r.reviewStatus === "pending").length,
      matched: rows.filter(isMatchRow).length,
      missing: rows.filter(isMissingRow).length,
      done: rows.filter((r) => r.reviewStatus !== "pending").length,
      all: rows.length,
    }),
    [rows],
  );
  const shown = rows.filter((r) =>
    filter === "all"
      ? true
      : filter === "todo"
        ? r.reviewStatus === "pending"
        : filter === "matched"
          ? isMatchRow(r)
          : filter === "missing"
            ? isMissingRow(r)
            : r.reviewStatus !== "pending",
  );

  return (
    <div className="space-y-3">
      {migrationNeeded && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          The review columns haven&apos;t been added to temp_people yet, so buttons will fail — run the SQL for
          migration 0018 first.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
              filter === f.key
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {f.label} ({counts[f.key]})
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {shown.map((r) => (
          <RowCard key={`${r.shaheenId}:${r.reviewStatus}:${r.matched?.id ?? ""}`} row={r} people={people} disabled={migrationNeeded} />
        ))}
        {shown.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Nothing here.</p>}
      </div>
    </div>
  );
}
