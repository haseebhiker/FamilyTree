import Link from "next/link";

const TABS = [
  { key: "list", label: "List", href: "/tree" },
  { key: "chart", label: "Chart", href: "/tree/chart" },
  { key: "relationships", label: "Relationship Lines", href: "/tree/relationships" },
  { key: "surnames", label: "Surnames", href: "/tree/surnames" },
] as const;

/** Shared row of links across the four Tree pages — the current page renders as plain text, the rest as links. */
export function TreeSubnav({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-600">
      {TABS.map((t) =>
        t.key === active ? (
          <span key={t.key} className="text-slate-900">
            {t.label}
          </span>
        ) : (
          <Link key={t.key} href={t.href} className="hover:text-slate-900">
            {t.label}
          </Link>
        ),
      )}
    </div>
  );
}
