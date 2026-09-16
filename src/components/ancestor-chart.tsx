"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { PersonName } from "@/components/person-name";

export interface AncestorNode {
  id: string;
  full_name: string;
  preferred_name: string | null;
  surname_tag: string | null;
  father?: AncestorNode | null;
  mother?: AncestorNode | null;
}

function AncestorNodeItem({
  node,
  isRoot = false,
  rootRef,
}: {
  node: AncestorNode;
  isRoot?: boolean;
  rootRef?: React.RefObject<HTMLAnchorElement | null>;
}) {
  const hasParents = !!(node.father || node.mother);
  return (
    <li>
      <Link
        href={`/people/${node.id}`}
        ref={isRoot ? rootRef : undefined}
        className={`inline-block rounded-md border px-3 py-1.5 text-xs leading-snug whitespace-nowrap hover:bg-slate-50 ${
          isRoot ? "border-slate-400 bg-slate-50 font-medium text-slate-900" : "border-slate-200 bg-white text-slate-700"
        }`}
      >
        <PersonName person={node} />
      </Link>
      {hasParents && (
        <ul>
          {node.father ? (
            <AncestorNodeItem node={node.father} />
          ) : (
            <li>
              <span className="ancestor-blank" />
            </li>
          )}
          {node.mother ? (
            <AncestorNodeItem node={node.mother} />
          ) : (
            <li>
              <span className="ancestor-blank" />
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

/**
 * A top-down ancestor pedigree chart (person, then parents, then
 * grandparents) with connector lines, in the classic "org chart" style.
 * Siblings render as a plain row above it, deliberately outside the <ul>
 * tree — they aren't descendants of anyone in this chart, so folding them
 * into the connector-line structure would misrepresent the relationship
 * it's drawing, not just complicate the CSS.
 */
export function AncestorChart({ root, siblings }: { root: AncestorNode; siblings?: AncestorNode[] }) {
  const rootRef = useRef<HTMLAnchorElement>(null);

  // On a wide chart (several generations of grandparents), the scroll
  // container opens at its natural left edge rather than centered on the
  // person it's actually about — reported live: someone opening their own
  // "Ancestors" card saw a stranger's name in view and had to scroll to
  // find themselves. Centering the root node into view on mount fixes
  // that without needing to touch the centering CSS the rest of the chart
  // already relies on.
  useEffect(() => {
    rootRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, []);

  if (!root.father && !root.mother) return null;
  return (
    <div className="ancestor-chart-wrap overflow-x-auto py-2">
      {siblings && siblings.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium text-slate-400">Siblings:</span>
          {siblings.map((s) => (
            <Link
              key={s.id}
              href={`/people/${s.id}`}
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-50"
            >
              <PersonName person={s} />
            </Link>
          ))}
        </div>
      )}
      <ul className="ancestor-chart">
        <AncestorNodeItem node={root} isRoot rootRef={rootRef} />
      </ul>
    </div>
  );
}
