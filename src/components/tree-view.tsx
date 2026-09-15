"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PersonName, displayNameText } from "@/components/person-name";

export interface TreeNodeData {
  id: string;
  full_name: string;
  preferred_name: string | null;
  surname_tag: string | null;
  living_status: string;
  father_id: string | null;
  mother_id: string | null;
}

function TreeNode({
  person,
  childrenByParent,
  depth,
  defaultExpanded,
  pathToMeIds,
}: {
  person: TreeNodeData;
  childrenByParent: Map<string, TreeNodeData[]>;
  depth: number;
  defaultExpanded: boolean;
  pathToMeIds: Set<string>;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const kids = childrenByParent.get(person.id) ?? [];

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
          <PersonName person={person} />
        </Link>
        {kids.length > 0 && <span className="text-xs text-slate-400">({kids.length})</span>}
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
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function TreeView({
  roots,
  allPeople,
  myPersonId,
}: {
  roots: TreeNodeData[];
  allPeople: TreeNodeData[];
  myPersonId?: string | null;
}) {
  const [query, setQuery] = useState("");

  // The chain of ancestors from "me" up to whichever root it connects to
  // (there can be two candidate lines — paternal and maternal — so this
  // explores both and keeps the one that actually reaches a root, shortest
  // first) — every id on it auto-expands, so opening the tree lands you
  // looking at your own direct lineage instead of a wall of collapsed
  // branches.
  const pathToMeIds = useMemo(() => {
    if (!myPersonId) return new Set<string>();
    const byId = new Map(allPeople.map((p) => [p.id, p]));
    const rootIds = new Set(roots.map((r) => r.id));
    if (!byId.has(myPersonId)) return new Set<string>();

    const queue: string[][] = [[myPersonId]];
    const visited = new Set([myPersonId]);
    while (queue.length > 0) {
      const path = queue.shift()!;
      const lastId = path[path.length - 1];
      if (rootIds.has(lastId)) return new Set(path);
      const person = byId.get(lastId);
      if (!person) continue;
      for (const parentId of [person.father_id, person.mother_id]) {
        if (parentId && !visited.has(parentId)) {
          visited.add(parentId);
          queue.push([...path, parentId]);
        }
      }
    }
    return new Set<string>();
  }, [allPeople, roots, myPersonId]);

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
    for (const list of map.values()) list.sort((a, b) => a.full_name.localeCompare(b.full_name));
    return map;
  }, [allPeople]);

  const searchResults = useMemo(() => {
    if (query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    return allPeople.filter((p) => displayNameText(p).toLowerCase().includes(q)).slice(0, 15);
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
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        {searchResults.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
            {searchResults.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/people/${p.id}`}
                  className="block px-3 py-2 text-sm hover:bg-slate-50"
                  onClick={() => setQuery("")}
                >
                  <PersonName person={p} />
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
          />
        </ul>
      )}

      {otherRoots.length > 0 && (
        <details className="rounded-lg border border-slate-200 bg-white" open={otherRoots.some((r) => pathToMeIds.has(r.id))}>
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-600">
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
              />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
