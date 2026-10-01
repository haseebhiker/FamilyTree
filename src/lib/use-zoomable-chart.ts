"use client";

import { useRef, useState } from "react";

// Low enough to fit the "All generations" tree (hundreds of boxes) on screen.
const MIN_ZOOM = 0.15;
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

// How far the mouse has to move before a press counts as a drag rather than
// a click — below this, clicking a name still re-centers / opens it.
const DRAG_THRESHOLD_PX = 5;

/**
 * Shared zoom/pan behavior for the org-chart-style pedigree charts
 * (AncestorChart, FamilyTreeChart): +/− buttons, two-finger pinch on touch,
 * ctrl/⌘+wheel, and click-and-drag with the mouse to pan (touch already
 * pans natively). Spread `wrapProps` onto the scrollable container the
 * chart lives in.
 */
export function useZoomableChart() {
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  // Set when a drag just ended, so the click that the browser fires on
  // mouse-up (on whatever name the drag finished over) is swallowed instead
  // of navigating.
  const suppressClickRef = useRef(false);

  return {
    zoom,
    zoomIn: () => setZoom((z) => clampZoom(z + ZOOM_STEP)),
    zoomOut: () => setZoom((z) => clampZoom(z - ZOOM_STEP)),
    resetZoom: () => setZoom(1),
    wrapProps: {
      style: { cursor: dragging ? "grabbing" : "grab", userSelect: "none" } as React.CSSProperties,
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        if (e.pointerType !== "mouse" || e.button !== 0) return;
        const el = e.currentTarget;
        dragRef.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        const drag = dragRef.current;
        if (!drag) return;
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (!drag.moved) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
          drag.moved = true;
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        e.currentTarget.scrollLeft = drag.left - dx;
        e.currentTarget.scrollTop = drag.top - dy;
      },
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
        if (dragRef.current?.moved) {
          suppressClickRef.current = true;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        }
        dragRef.current = null;
        setDragging(false);
      },
      onPointerCancel: () => {
        dragRef.current = null;
        setDragging(false);
      },
      onClickCapture: (e: React.MouseEvent) => {
        if (!suppressClickRef.current) return;
        suppressClickRef.current = false;
        e.preventDefault();
        e.stopPropagation();
      },
      // Links/text are natively draggable (the "ghost image" drag), which
      // would hijack the pan the moment a press lands on a name.
      onDragStart: (e: React.DragEvent) => e.preventDefault(),
      onWheel: (e: React.WheelEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        setZoom((z) => clampZoom(z - e.deltaY * 0.01));
      },
      onTouchStart: (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
          pinchStartRef.current = { distance: touchDistance(e.touches), zoom };
        }
      },
      onTouchMove: (e: React.TouchEvent) => {
        if (e.touches.length === 2 && pinchStartRef.current) {
          e.preventDefault();
          const ratio = touchDistance(e.touches) / pinchStartRef.current.distance;
          setZoom(clampZoom(pinchStartRef.current.zoom * ratio));
        }
      },
      onTouchEnd: () => {
        pinchStartRef.current = null;
      },
    },
  };
}
