"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { searchText } from "@/components/person-name";
import { sortSiblings } from "@/lib/sort-by-age";
import { ChevronIcon } from "@/components/ui";

export interface TreeNodeData {
  id: string;
  full_name: string;
  preferred_name: string | null;
  surname_tag: string | null;
  living_status: string;
  father_id: string | null;
  mother_id: string | null;
  birth_year?: number | null;
  birth_month?: number | null;
  birth_day?: number | null;
  birth_order?: number | null;
}

/**
 * The chain of ancestors from `myPersonId` straight up the paternal line
 * (father, father's father, ...) to whichever root it connects to. Follows
 * father_id only, not mother_id: the family line this tree is organized
 * around is patrilineal, so the default view shouldn't wander onto a
 * maternal branch just because it happens to reach a root first.
 */
function computePathToMe(myPersonId: string | null | undefined, allPeople: TreeNodeData[], roots: TreeNodeData[]): Set<string> {
  if (!myPersonId) return new Set();
  const byId = new Map(allPeople.map((p) => [p.id, p]));
  const rootIds = new Set(roots.map((r) => r.id));
  if (!byId.has(myPersonId)) return new Set();

  const path: string[] = [myPersonId];
  let currentId = myPersonId;
  while (!rootIds.has(currentId)) {
    const person = byId.get(currentId);
    if (!person?.father_id) return new Set();
    currentId = person.father_id;
    path.push(currentId);
  }
  return new Set(path);
}

/** "Expand/collapse everything under this person" — a numbered signal passed down the tree; a node obeys the newest one it has seen. */
type Force = { n: number; open: boolean } | null;
let forceCounter = 0;

function TreeNode({
  person,
  childrenByParent,
  depth,
  defaultExpanded,
  pathToMeIds,
  spouseNames,
  force,
}: {
  person: TreeNodeData;
  childrenByParent: Map<string, TreeNodeData[]>;
  depth: number;
  defaultExpanded: boolean;
  pathToMeIds: Set<string>;
  spouseNames: Record<string, string[]>;
  force: Force;
}) {
  const [expanded, setExpanded] = useState(force ? force.open : defaultExpanded);
  const [localForce, setLocalForce] = useState<Force>(null);
  const kids = childrenByParent.get(person.id) ?? [];
  const effectiveForce = localForce && (!force || localForce.n > force.n) ? localForce : force;
  const lastApplied = useRef(force?.n ?? 0);
  useEffect(() => {
    if (effectiveForce && effectiveForce.n !== lastApplied.current) {
      lastApplied.current = effectiveForce.n;
      setExpanded(effectiveForce.open);
    }
  }, [effectiveForce]);
  const hasGrandkids = kids.some((k) => (childrenByParent.get(k.id)?.length ?? 0) > 0);
  const subtreeOpen = effectiveForce?.open === true;

  return (
    <li>
      <div className="flex items-center gap-1 py-0.5">
        {kids.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <Link
          href={`/people/${person.id}`}
          className={`text-sm hover:underline ${pathToMeIds.has(person.id) ? "font-semibold text-slate-900" : "text-slate-900"}`}
        >
          {/* Preferred name leads, in its own color, followed by the full
              name — not TreeName's preferred-replaces-full behavior, since
              here (and in search) telling people apart matters more than
              the shorter, tidier label. Inline rather than TreeName's
              stacked-under-name style too — this list can run to hundreds
              of rows, and the surname needs to be legible at a glance while
              scanning it, not just present in small text on its own line. */}
          {person.preferred_name?.trim() && (
            <span className="font-semibold text-blue-700">{person.preferred_name} </span>
          )}
          {person.full_name}
          {person.surname_tag && (
            <span className="ml-1 text-[0.7rem] font-medium tracking-wide text-amber-700">{person.surname_tag}</span>
          )}
        </Link>
        {(spouseNames[person.id]?.length ?? 0) > 0 && (
          <span className="ml-3 text-xs text-violet-600">({spouseNames[person.id].join(", ")})</span>
        )}
        {kids.length > 0 && <span className="text-xs text-slate-400">({kids.length})</span>}
        {hasGrandkids && (
          <button
            type="button"
            onClick={() => {
              const open = !(subtreeOpen && expanded);
              setLocalForce({ n: ++forceCounter, open });
              setExpanded(open);
            }}
            className="ml-auto shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          >
            {subtreeOpen && expanded ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>
      {expanded && kids.length > 0 && (
        <ul className="ml-5 border-l border-slate-200 pl-3">
          {kids.map((child) => (
            <TreeNode
              key={child.id}
              person={child}
              childrenByParent={childrenByParent}
              depth={depth + 1}
              defaultExpanded={pathToMeIds.size > 0 ? pathToMeIds.has(child.id) : depth + 1 < 1}
              pathToMeIds={pathToMeIds}
              spouseNames={spouseNames}
              force={effectiveForce}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * A search result row — richer than TreeName (used everywhere else in the
 * tree), since search is specifically for telling apart several people who
 * share a name. Desktop shows full name, preferred name, and both parents'
 * names when there's room; mobile drops straight to just the full name
 * plus surname, since there isn't room for all of it there.
 */
function SearchResultRow({ person, peopleById }: { person: TreeNodeData; peopleById: Map<string, TreeNodeData> }) {
  const father = person.father_id ? peopleById.get(person.father_id) : null;
  const mother = person.mother_id ? peopleById.get(person.mother_id) : null;
  const parentNames = [father, mother]
    .filter((p): p is TreeNodeData => !!p)
    .map((p) => p.preferred_name?.trim() || p.full_name);
  const preferred = person.preferred_name?.trim();
  // Same amber, small-caps treatment PersonName/TreeName use for the
  // surname everywhere else — a trailing gray fragment was too easy to
  // miss when the whole point of showing it here is telling apart same-
  // named people at a glance.
  const surname = person.surname_tag && (
    <div className="text-[0.7rem] font-medium tracking-wide text-amber-700">{person.surname_tag}</div>
  );

  return (
    <div className="px-3 py-2">
      <div className="hidden text-sm sm:block">
        {preferred && <span className="font-semibold text-blue-700">{preferred} </span>}
        <span className="font-medium text-slate-900">{person.full_name}</span>
        {surname}
        {parentNames.length > 0 && <div className="text-xs text-slate-400">Child of {parentNames.join(" & ")}</div>}
      </div>
      <div className="text-sm sm:hidden">
        <span className="font-medium text-slate-900">{person.full_name}</span>
        {surname}
      </div>
    </div>
  );
}

export function TreeView({
  roots,
  allPeople,
  spouseNames,
  myPersonId,
}: {
  roots: TreeNodeData[];
  allPeople: TreeNodeData[];
  spouseNames: Record<string, string[]>;
  myPersonId?: string | null;
}) {
  const [query, setQuery] = useState("");

  // Every id on this auto-expands, so opening the tree lands you looking at
  // your own direct paternal lineage instead of a wall of collapsed branches.
  const pathToMeIds = useMemo(
    () => computePathToMe(myPersonId, allPeople, roots),
    [allPeople, roots, myPersonId],
  );

  // For "child of X & Y" in search results only — looks up a hit's parents
  // by id to show their names.
  const peopleById = useMemo(() => new Map(allPeople.map((p) => [p.id, p])), [allPeople]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, TreeNodeData[]>();
    for (const p of allPeople) {
      for (const parentId of [p.father_id, p.mother_id]) {
        if (!parentId) continue;
        const list = map.get(parentId) ?? [];
        if (!list.some((c) => c.id === p.id)) list.push(p);
        map.set(parentId, list);
      }
    }
    for (const [parentId, list] of map) map.set(parentId, sortSiblings(list));
    return map;
  }, [allPeople]);

  const searchResults = useMemo(() => {
    if (query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    return allPeople.filter((p) => searchText(p).toLowerCase().includes(q)).slice(0, 15);
  }, [query, allPeople]);

  // roots is pre-sorted by descendant count (largest first, see page.tsx) —
  // the first one is the real family tree; the rest are almost always tiny
  // disconnected stubs (e.g. a spouse whose own parents were never
  // recorded). Showing 50 of those expanded at once is exactly what made
  // this "hard to follow," so only the main tree opens by default and the
  // rest sit behind a single collapsed section.
  const [mainRoot, ...otherRoots] = roots;

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a person by name…"
          autoFocus
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        {searchResults.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
            {searchResults.map((p) => (
              <li key={p.id}>
                <Link href={`/people/${p.id}`} className="block hover:bg-slate-50" onClick={() => setQuery("")}>
                  <SearchResultRow person={p} peopleById={peopleById} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {mainRoot && (
        <ul>
          <TreeNode
            person={mainRoot}
            childrenByParent={childrenByParent}
            depth={0}
            defaultExpanded
            pathToMeIds={pathToMeIds}
            spouseNames={spouseNames}
            force={null}
          />
        </ul>
      )}

      {otherRoots.length > 0 && (
        <details className="group rounded-lg border border-slate-200 bg-white" open={otherRoots.some((r) => pathToMeIds.has(r.id))}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-slate-600">
            <ChevronIcon className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
            Other family lines not yet connected to the main tree ({otherRoots.length})
          </summary>
          <ul className="border-t border-slate-100 p-4 pt-2">
            {otherRoots.map((root) => (
              <TreeNode
                key={root.id}
                person={root}
                childrenByParent={childrenByParent}
                depth={0}
                defaultExpanded={pathToMeIds.has(root.id)}
                pathToMeIds={pathToMeIds}
                spouseNames={spouseNames}
                force={null}
              />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
