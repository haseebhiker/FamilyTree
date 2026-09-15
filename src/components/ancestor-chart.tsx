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

function AncestorNodeItem({ node, isRoot = false }: { node: AncestorNode; isRoot?: boolean }) {
  const hasParents = !!(node.father || node.mother);
  return (
    <li>
      <Link
        href={`/people/${node.id}`}
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

/** A top-down ancestor pedigree chart (person, then parents, then grandparents) with connector lines, in the classic "org chart" style. */
export function AncestorChart({ root }: { root: AncestorNode }) {
  if (!root.father && !root.mother) return null;
  return (
    <div className="ancestor-chart-wrap overflow-x-auto py-2">
      <ul className="ancestor-chart">
        <AncestorNodeItem node={root} isRoot />
      </ul>
    </div>
  );
}
