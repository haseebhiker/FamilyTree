"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface TreeNodeData {
  id: string;
  full_name: string;
  surname_tag: string | null;
  living_status: string;
  father_id: string | null;
  mother_id: string | null;
}

function displayName(p: Pick<TreeNodeData, "full_name" | "surname_tag">) {
  return p.surname_tag ? `${p.full_name} /${p.surname_tag}/` : p.full_name;
}

function TreeNode({
  person,
  childrenByParent,
  depth,
}: {
  person: TreeNodeData;
  childrenByParent: Map<string, TreeNodeData[]>;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
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
          className={
            person.living_status === "deceased"
              ? "text-sm text-slate-500 hover:underline"
              : "text-sm text-slate-900 hover:underline"
          }
        >
          {displayName(person)}
        </Link>
      </div>
      {expanded && kids.length > 0 && (
        <ul className="ml-5 border-l border-slate-200 pl-3">
          {kids.map((child) => (
            <TreeNode key={child.id} person={child} childrenByParent={childrenByParent} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function TreeView({ roots, allPeople }: { roots: TreeNodeData[]; allPeople: TreeNodeData[] }) {
  const [query, setQuery] = useState("");

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
    return allPeople.filter((p) => displayName(p).toLowerCase().includes(q)).slice(0, 15);
  }, [query, allPeople]);

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
                  {displayName(p)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul>
        {roots.map((root) => (
          <TreeNode key={root.id} person={root} childrenByParent={childrenByParent} depth={0} />
        ))}
      </ul>
    </div>
  );
}
