"use client";

import { useRef, useState } from "react";

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

/**
 * Shared zoom/pinch behavior for the org-chart-style pedigree charts
 * (AncestorChart, FamilyTreeChart): +/− buttons, two-finger pinch on touch,
 * and ctrl/⌘+wheel, all clamped to the same range. Spread `wrapProps` onto
 * the scrollable container the chart lives in.
 */
export function useZoomableChart() {
  const [zoom, setZoom] = useState(1);
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);

  return {
    zoom,
    zoomIn: () => setZoom((z) => clampZoom(z + ZOOM_STEP)),
    zoomOut: () => setZoom((z) => clampZoom(z - ZOOM_STEP)),
    resetZoom: () => setZoom(1),
    wrapProps: {
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
