"use client";

import { useEffect, useRef, useState } from "react";
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

export interface FamilyTreeCrossLink {
  aId: string;
  bId: string;
}

function FamilyTreeNodeItem({
  node,
  isRoot = false,
  rootRef,
  basePath,
}: {
  node: FamilyTreeNode;
  isRoot?: boolean;
  rootRef?: React.RefObject<HTMLAnchorElement | null>;
  basePath: string;
}) {
  return (
    <li>
      <div className="inline-flex flex-col items-center gap-0.5">
        <Link
          href={`${basePath}?root=${node.id}`}
          ref={isRoot ? rootRef : undefined}
          data-person-id={node.id}
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
            <FamilyTreeNodeItem key={child.id} node={child} basePath={basePath} />
          ))}
        </ul>
      )}
      {node.hiddenChildrenCount > 0 && (
        <div className="pt-2">
          <Link href={`${basePath}?root=${node.id}`} className="text-[10px] font-medium text-blue-600 hover:underline">
            +{node.hiddenChildrenCount} more ↓
          </Link>
        </div>
      )}
    </li>
  );
}

interface ScreenLine {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Draws `crossLinks` as an SVG overlay on top of the chart — a straight
 * line between the two boxes named by each link's ids, found via their
 * `data-person-id` attribute. Positions are measured with
 * getBoundingClientRect rather than derived from the tree structure,
 * because the two ends of a cross-link are (by definition — see
 * findCrossLinks) in different branches with no fixed geometric relationship
 * to each other; actual rendered pixels are the only thing that works
 * regardless of how the CSS org-chart connectors above happen to lay
 * everything out. Recomputes on zoom change and on the chart's own size
 * changing (a ResizeObserver on the content, not the scroll viewport, since
 * scrolling itself doesn't move anything in content-relative coordinates).
 */
function CrossLinkOverlay({
  crossLinks,
  wrapRef,
  zoom,
}: {
  crossLinks: FamilyTreeCrossLink[];
  wrapRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [lines, setLines] = useState<ScreenLine[]>([]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    function recompute() {
      const wrap = wrapRef.current;
      if (!wrap) return;
      setSize({ width: wrap.scrollWidth, height: wrap.scrollHeight });
      const wrapRect = wrap.getBoundingClientRect();
      const next: ScreenLine[] = [];
      for (const link of crossLinks) {
        const elA = wrap.querySelector<HTMLElement>(`[data-person-id="${CSS.escape(link.aId)}"]`);
        const elB = wrap.querySelector<HTMLElement>(`[data-person-id="${CSS.escape(link.bId)}"]`);
        if (!elA || !elB) continue;
        const rectA = elA.getBoundingClientRect();
        const rectB = elB.getBoundingClientRect();
        next.push({
          key: `${link.aId}:${link.bId}`,
          x1: rectA.left + rectA.width / 2 - wrapRect.left + wrap.scrollLeft,
          y1: rectA.top + rectA.height / 2 - wrapRect.top + wrap.scrollTop,
          x2: rectB.left + rectB.width / 2 - wrapRect.left + wrap.scrollLeft,
          y2: rectB.top + rectB.height / 2 - wrapRect.top + wrap.scrollTop,
        });
      }
      setLines(next);
    }

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(wrap);
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [crossLinks, zoom, wrapRef]);

  if (lines.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute top-0 left-0"
      width={size.width}
      height={size.height}
      aria-hidden="true"
    >
      {lines.map((l) => (
        <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#dc2626" strokeWidth={2} strokeDasharray="6 4" opacity={0.75}>
          <title>Married within the family — also shown elsewhere in this chart as a blood relative</title>
        </line>
      ))}
    </svg>
  );
}

/**
 * A top-down descendant chart (person, then children, then grandchildren)
 * with connector lines — the same "org chart" visual language as
 * AncestorChart, just running the other direction. Only ever renders a
 * handful of generations (the server caps how deep `root` goes — see
 * VISIBLE_GENERATIONS in the pages that build it): clicking any name
 * re-centers the chart on them instead of trying to render the whole
 * 1,000+-person tree in the DOM at once, which is also how "+N more" under
 * a person with hidden children works. Zoom/pinch behavior is shared with
 * AncestorChart via useZoomableChart.
 *
 * `crossLinks` (admin-only feature, opt-in) draws extra dashed red lines
 * for marriages within the family — see findCrossLinks in
 * lib/family-tree-data.ts for what qualifies.
 */
export function FamilyTreeChart({
  root,
  crossLinks,
  basePath = "/tree/chart",
}: {
  root: FamilyTreeNode;
  crossLinks?: FamilyTreeCrossLink[];
  basePath?: string;
}) {
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
      <div ref={wrapRef} className="relative max-h-[70vh] overflow-auto py-2" {...wrapProps}>
        {crossLinks && crossLinks.length > 0 && (
          <CrossLinkOverlay crossLinks={crossLinks} wrapRef={wrapRef} zoom={zoom} />
        )}
        <ul className="family-tree-chart" style={{ zoom }}>
          <FamilyTreeNodeItem node={root} isRoot rootRef={rootRef} basePath={basePath} />
        </ul>
      </div>
    </div>
  );
}
