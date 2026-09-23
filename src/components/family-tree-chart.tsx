"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { TreeName } from "@/components/person-name";
import { useZoomableChart } from "@/lib/use-zoomable-chart";

export interface FamilyTreeNode {
  id: string;
  full_name: string;
  preferred_name: string | null;
  surname_tag: string | null;
  living_status: string;
  spouseNames: string[];
  children: FamilyTreeNode[];
  /** >0 when this person really does have children beyond the generations already expanded — click through to see them. */
  hiddenChildrenCount: number;
}

function FamilyTreeNodeItem({
  node,
  isRoot = false,
  rootRef,
}: {
  node: FamilyTreeNode;
  isRoot?: boolean;
  rootRef?: React.RefObject<HTMLAnchorElement | null>;
}) {
  return (
    <li>
      <div className="inline-flex flex-col items-center gap-0.5">
        <Link
          href={`/admin/family-tree?root=${node.id}`}
          ref={isRoot ? rootRef : undefined}
          title="Re-center the chart on this person"
          className={`inline-block rounded-md border px-3 py-1.5 text-xs leading-snug whitespace-nowrap hover:bg-slate-50 ${
            isRoot ? "border-slate-400 bg-slate-50 font-medium text-slate-900" : "border-slate-200 bg-white text-slate-700"
          } ${node.living_status === "deceased" ? "opacity-70" : ""}`}
        >
          <TreeName person={node} />
        </Link>
        {node.spouseNames.length > 0 && (
          <span className="text-[10px] whitespace-nowrap text-violet-600">⚭ {node.spouseNames.join(", ")}</span>
        )}
        <Link href={`/people/${node.id}`} className="text-[10px] text-slate-400 hover:text-slate-600 hover:underline">
          View profile
        </Link>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <FamilyTreeNodeItem key={child.id} node={child} />
          ))}
        </ul>
      )}
      {node.hiddenChildrenCount > 0 && (
        <div className="pt-2">
          <Link
            href={`/admin/family-tree?root=${node.id}`}
            className="text-[10px] font-medium text-blue-600 hover:underline"
          >
            +{node.hiddenChildrenCount} more ↓
          </Link>
        </div>
      )}
    </li>
  );
}

/**
 * A top-down descendant chart (person, then children, then grandchildren)
 * with connector lines — the same "org chart" visual language as
 * AncestorChart, just running the other direction. Only ever renders a
 * handful of generations (the server caps how deep `root` goes — see
 * VISIBLE_GENERATIONS in the page that builds it): clicking any name
 * re-centers the chart on them instead of trying to render the whole
 * 1,000+-person tree in the DOM at once, which is also how "+N more" under
 * a person with hidden children works. Zoom/pinch behavior is shared with
 * AncestorChart via useZoomableChart.
 */
export function FamilyTreeChart({ root }: { root: FamilyTreeNode }) {
  const rootRef = useRef<HTMLAnchorElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { zoom, zoomIn, zoomOut, resetZoom, wrapProps } = useZoomableChart();

  // Re-centers horizontally whenever a click swaps in a new root, not just
  // on first mount — same reasoning as AncestorChart's version of this.
  useEffect(() => {
    const rootEl = rootRef.current;
    const wrap = wrapRef.current;
    if (!rootEl || !wrap) return;
    wrap.scrollLeft = rootEl.offsetLeft - wrap.clientWidth / 2 + rootEl.offsetWidth / 2;
  }, [root.id]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={zoomOut}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-50"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetZoom}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={zoomIn}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-50"
          aria-label="Zoom in"
        >
          +
        </button>
        <span className="ml-1 text-xs text-slate-400">
          Pinch, or ctrl/⌘+scroll, to zoom. Click a name to re-center the chart on them.
        </span>
      </div>
      <div ref={wrapRef} className="max-h-[70vh] overflow-auto py-2" {...wrapProps}>
        <ul className="family-tree-chart" style={{ zoom }}>
          <FamilyTreeNodeItem node={root} isRoot rootRef={rootRef} />
        </ul>
      </div>
    </div>
  );
}
