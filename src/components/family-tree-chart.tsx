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
  spouses: { id: string; name: string }[];
  children: FamilyTreeNode[];
  /** >0 when this person really does have children beyond the generations already expanded — click through to see them. */
  hiddenChildrenCount: number;
}

export interface FamilyTreeRelationshipLink {
  aId: string;
  bId: string;
  /** "cross" — both spouses are blood-descendant boxes elsewhere in the chart (a marriage within the family). "marriage" — the ordinary case, one spouse married in and has no box of their own. */
  kind: "cross" | "marriage";
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
        {node.spouses.length > 0 && (
          <span className="text-[10px] whitespace-nowrap text-violet-600">
            ⚭{" "}
            {node.spouses.map((s, i) => (
              // A tagged span per spouse (not one joined string) so the line
              // overlay has something to point at even when this spouse has
              // no box of their own anywhere in the chart — see
              // data-spouse-label in FamilyTreeChart's overlay.
              <span key={s.id} data-spouse-label={s.id}>
                {i > 0 && ", "}
                {s.name}
              </span>
            ))}
          </span>
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
  kind: "cross" | "marriage";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const LINE_STYLE: Record<ScreenLine["kind"], { stroke: string; dash?: string; title: string }> = {
  cross: {
    stroke: "#dc2626",
    dash: "6 4",
    title: "Married within the family — also shown elsewhere in this chart as a blood relative",
  },
  marriage: { stroke: "#0891b2", title: "Married" },
};

/**
 * Finds an endpoint by id — a real box (`data-person-id`) if it has one,
 * otherwise the little name label next to whichever partner it's shown
 * beside (`data-spouse-label`). A "cross" link's ids are always real boxes;
 * a "marriage" link's `bId` is usually a label, since a spouse who married
 * in from outside the family never gets a box of their own.
 */
function findEndpoint(wrap: HTMLElement, id: string): HTMLElement | null {
  return (
    wrap.querySelector<HTMLElement>(`[data-person-id="${CSS.escape(id)}"]`) ??
    wrap.querySelector<HTMLElement>(`[data-spouse-label="${CSS.escape(id)}"]`)
  );
}

/**
 * Draws `links` as an SVG overlay on top of the chart — a straight line
 * between each link's two endpoints (see findEndpoint). Positions are
 * measured with getBoundingClientRect rather than derived from the tree
 * structure, because a "cross" link's two ends are (by definition — see
 * findRelationshipLinks) in different branches with no fixed geometric
 * relationship to each other; actual rendered pixels are the only thing
 * that works regardless of how the CSS org-chart connectors above happen to
 * lay everything out. Recomputes on zoom change and on the chart's own size
 * changing (a ResizeObserver on the content, not the scroll viewport, since
 * scrolling itself doesn't move anything in content-relative coordinates).
 */
function RelationshipLineOverlay({
  links,
  wrapRef,
  zoom,
}: {
  links: FamilyTreeRelationshipLink[];
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
      for (const link of links) {
        const elA = findEndpoint(wrap, link.aId);
        const elB = findEndpoint(wrap, link.bId);
        if (!elA || !elB) continue;
        const rectA = elA.getBoundingClientRect();
        const rectB = elB.getBoundingClientRect();
        next.push({
          key: `${link.aId}:${link.bId}`,
          kind: link.kind,
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
  }, [links, zoom, wrapRef]);

  if (lines.length === 0) return null;

  return (
    <svg className="pointer-events-none absolute top-0 left-0" width={size.width} height={size.height} aria-hidden="true">
      {lines.map((l) => {
        const style = LINE_STYLE[l.kind];
        return (
          <line
            key={l.key}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke={style.stroke}
            strokeWidth={2}
            strokeDasharray={style.dash}
            opacity={0.75}
          >
            <title>{style.title}</title>
          </line>
        );
      })}
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
 * `relationshipLinks` (admin-only feature, opt-in) draws extra lines for
 * every marriage touching this subtree — teal for an ordinary marriage,
 * dashed red for one within the family — see findRelationshipLinks in
 * lib/family-tree-data.ts.
 */
export function FamilyTreeChart({
  root,
  relationshipLinks,
  basePath = "/tree/chart",
}: {
  root: FamilyTreeNode;
  relationshipLinks?: FamilyTreeRelationshipLink[];
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
        {relationshipLinks && relationshipLinks.length > 0 && (
          <RelationshipLineOverlay links={relationshipLinks} wrapRef={wrapRef} zoom={zoom} />
        )}
        <ul className="family-tree-chart" style={{ zoom }}>
          <FamilyTreeNodeItem node={root} isRoot rootRef={rootRef} basePath={basePath} />
        </ul>
      </div>
    </div>
  );
}
