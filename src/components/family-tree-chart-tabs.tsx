"use client";

import { useState } from "react";
import { FamilyTreeChart, type FamilyTreeNode, type FamilyTreeRelationshipLink } from "@/components/family-tree-chart";

const TABS = [
  { key: "chart", label: "Chart" },
  { key: "relationships", label: "Relationship Lines (Admin)" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/**
 * Wraps FamilyTreeChart with an inner tab bar for admins: the plain chart
 * everyone sees, plus a second tab overlaying marriage/blood-relation lines
 * (see findRelationshipLinks/findKinshipLinks in lib/family-tree-data.ts).
 * Those lines are noisy clutter most members have no reason to see, so
 * they're opt-in behind a tab rather than always-on — this used to be a
 * whole separate /admin/family-tree route instead of a tab on the same
 * page non-admins already have open, which just meant loading and
 * maintaining two near-identical pages.
 */
export function FamilyTreeChartTabs({
  root,
  relationshipLinks,
  basePath,
}: {
  root: FamilyTreeNode;
  /** undefined for a non-admin viewer — no tab bar renders at all in that case, same as before this existed. */
  relationshipLinks?: FamilyTreeRelationshipLink[];
  basePath: string;
}) {
  const [tab, setTab] = useState<TabKey>("chart");

  if (!relationshipLinks) {
    return <FamilyTreeChart root={root} basePath={basePath} />;
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${
              tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "relationships" && (
        <p className="text-xs text-slate-500">
          <span className="font-medium text-cyan-700">Teal</span> = ordinary marriage ·{" "}
          <span className="font-medium text-red-600">dashed red</span> = marriage within the family ·{" "}
          <span className="font-medium text-amber-700">dashed amber</span> = in-law spouses who turn out to be
          related to each other.
        </p>
      )}
      <FamilyTreeChart
        root={root}
        basePath={basePath}
        relationshipLinks={tab === "relationships" ? relationshipLinks : undefined}
      />
    </div>
  );
}
