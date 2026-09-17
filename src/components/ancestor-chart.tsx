"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TreeName } from "@/components/person-name";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.2;

function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** Distance between two touch points — pinch amount is just the ratio of this now vs. at gesture start. */
function touchDistance(touches: React.TouchList) {
  const [a, b] = [touches[0], touches[1]];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

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
  // Parents render above the person, not below — ancestors ABOVE the
  // person they belong to is the convention Haseeb expects, and it also
  // makes the DOM/reading order match what's on screen (oldest generation
  // first), rather than reversing one but not the other via CSS.
  return (
    <li>
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
      <Link
        href={`/people/${node.id}`}
        ref={isRoot ? rootRef : undefined}
        className={`inline-block rounded-md border px-3 py-1.5 text-xs leading-snug whitespace-nowrap hover:bg-slate-50 ${
          isRoot ? "border-slate-400 bg-slate-50 font-medium text-slate-900" : "border-slate-200 bg-white text-slate-700"
        }`}
      >
        <TreeName person={node} />
      </Link>
    </li>
  );
}

/**
 * A top-down ancestor pedigree chart (person, then parents, then
 * grandparents) with connector lines, in the classic "org chart" style.
 * Zoomable via the +/− buttons, two-finger pinch on touch, or ctrl/⌘+wheel
 * on a trackpad or mouse (the same gesture browsers already use for page
 * zoom, so it's the one people reach for without being told). Uses the
 * `zoom` CSS property rather than `transform: scale` specifically because
 * it reflows layout — the scroll container's scrollable area grows and
 * shrinks with it automatically, where a transform's visual size and its
 * layout box would otherwise disagree and need manual re-measuring to
 * keep the scrollbars matching what's actually on screen.
 */
export function AncestorChart({ root }: { root: AncestorNode }) {
  const rootRef = useRef<HTMLAnchorElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);

  // On a wide chart (several generations of grandparents), the scroll
  // container opens at its natural left edge rather than centered on the
  // person it's actually about — reported live: someone opening their own
  // "Ancestors" card saw a stranger's name in view and had to scroll to
  // find themselves. Centering the root node horizontally on mount fixes
  // that. This sets scrollLeft on the wrap div directly rather than
  // rootRef.current.scrollIntoView(): scrollIntoView's block option walks
  // up EVERY scrollable ancestor, not just this chart's own horizontal
  // one — since the chart normally sits below the fold, "nearest" was
  // dragging the whole page down to reveal it on every load, landing
  // scrolled past the header on first open every single time.
  useEffect(() => {
    const rootEl = rootRef.current;
    const wrap = wrapRef.current;
    if (!rootEl || !wrap) return;
    wrap.scrollLeft = rootEl.offsetLeft - wrap.clientWidth / 2 + rootEl.offsetWidth / 2;
  }, []);

  if (!root.father && !root.mother) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-50"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-50"
          aria-label="Zoom in"
        >
          +
        </button>
        <span className="ml-1 text-xs text-slate-400">Pinch, or ctrl/⌘+scroll, to zoom</span>
      </div>
      <div
        ref={wrapRef}
        className="ancestor-chart-wrap overflow-auto py-2"
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          setZoom((z) => clampZoom(z - e.deltaY * 0.01));
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            pinchStartRef.current = { distance: touchDistance(e.touches), zoom };
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && pinchStartRef.current) {
            e.preventDefault();
            const ratio = touchDistance(e.touches) / pinchStartRef.current.distance;
            setZoom(clampZoom(pinchStartRef.current.zoom * ratio));
          }
        }}
        onTouchEnd={() => {
          pinchStartRef.current = null;
        }}
      >
        <ul className="ancestor-chart" style={{ zoom }}>
          <AncestorNodeItem node={root} isRoot rootRef={rootRef} />
        </ul>
      </div>
    </div>
  );
}
