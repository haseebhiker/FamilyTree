import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { Card, ChevronIcon } from "@/components/ui";
import { PersonName } from "@/components/person-name";
import {
  stepLabel,
  describeRelationship,
  describeSpecificBlood,
  describeRelationshipTamil,
  describeRelationshipHindi,
  type PathStep,
  type Gender,
} from "@/lib/relationship";

interface PersonLite {
  id: string;
  full_name: string;
  preferred_name: string | null;
  surname_tag: string | null;
}

function RelationshipPath({
  steps,
  genders,
  birthYears,
  birthOrders,
  sourceId,
  peopleById,
  sourceLabel,
  possessive,
}: {
  steps: PathStep[];
  genders: Map<string, Gender>;
  birthYears: Map<string, number | null | undefined>;
  birthOrders: Map<string, number | null | undefined>;
  sourceId: string;
  peopleById: Map<string, PersonLite>;
  sourceLabel: ReactNode;
  possessive: string;
}) {
  const summary = describeRelationship(steps, genders);
  const specific = describeSpecificBlood(steps, genders);
  const tamil = describeRelationshipTamil(steps, genders, birthYears, birthOrders, sourceId);
  const hindi = describeRelationshipHindi(steps, genders);
  const last = peopleById.get(steps[steps.length - 1].id);

  return (
    // Named group ("group/path") — this can end up nested inside the
    // "Show N more relationships" <details> below, which also uses a
    // group/chevron pattern. An unnamed "group" doesn't scope to the
    // nearest ancestor; opening the OUTER one would leak its open state
    // into every "group-open:" class in here too, rotating these chevrons
    // and hiding the "Expand map" pill even while each card is still
    // individually closed.
    <details className="group/path rounded-md border border-slate-200 p-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-slate-800">
        <ChevronIcon className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open/path:rotate-90" />
        <span className="flex-1">
          {summary ? (
            <>
              {last ? <PersonName person={last} /> : "They"} is {possessive} <span className="font-semibold">{summary}</span>
              {tamil && (
                <span className="text-slate-500">
                  {" "}
                  ({tamil.translit} · <span lang="ta">{tamil.tamil}</span>)
                </span>
              )}
              {hindi && <span className="text-amber-700"> · {hindi}</span>}
            </>
          ) : (
            <>See the connection ({steps.length} steps)</>
          )}
        </span>
        <span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 group-open/path:hidden">
          Expand map →
        </span>
      </summary>
      <div className="mt-3 border-t border-slate-100 pt-3">
        {specific && (
          <p className="mb-2 text-xs text-slate-600">
            Specifically: <span className="font-medium">{specific}</span>
          </p>
        )}
        <div className="flex flex-wrap items-start gap-x-2 gap-y-3 text-xs">
          <div className="text-center">
            <div className="font-medium text-slate-900">{sourceLabel}</div>
          </div>
          {steps.map((step) => {
            const person = peopleById.get(step.id);
            const gender = genders.get(step.id) ?? null;
            return (
              <Fragment key={step.id}>
                <span className="pt-1 text-slate-300">→</span>
                <div className="text-center">
                  {person ? (
                    <Link href={`/people/${person.id}`} className="font-medium text-slate-900 hover:underline">
                      <PersonName person={person} />
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-400">Unknown</span>
                  )}
                  <div className="text-slate-400">{stepLabel(step.kind, gender)}</div>
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
    </details>
  );
}

export function RelationshipFinder({
  paths,
  genders,
  birthYears,
  birthOrders,
  sourceId,
  peopleById,
  title = "How you're related",
  sourceLabel = "You",
  possessive = "your",
}: {
  paths: PathStep[][];
  genders: Map<string, Gender>;
  birthYears: Map<string, number | null | undefined>;
  birthOrders: Map<string, number | null | undefined>;
  sourceId: string;
  peopleById: Map<string, PersonLite>;
  title?: string;
  sourceLabel?: ReactNode;
  possessive?: string;
}) {
  if (paths.length === 0) return null;

  const visible = paths.slice(0, 2);
  const rest = paths.slice(2);

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">
        {paths.length > 1 ? (
          sourceLabel === "You" ? (
            <>You&apos;re related {paths.length} different ways</>
          ) : (
            <>{sourceLabel} is related {paths.length} different ways</>
          )
        ) : (
          title
        )}
      </h2>
      <div className="space-y-2">
        {visible.map((steps, i) => (
          <RelationshipPath
            key={i}
            steps={steps}
            genders={genders}
            birthYears={birthYears}
            birthOrders={birthOrders}
            sourceId={sourceId}
            peopleById={peopleById}
            sourceLabel={sourceLabel}
            possessive={possessive}
          />
        ))}
      </div>
      {rest.length > 0 && (
        <details className="group/more mt-2 rounded-md border border-slate-200">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-slate-500">
            <ChevronIcon className="h-3.5 w-3.5 shrink-0 transition-transform group-open/more:rotate-90" />
            Show {rest.length} more {rest.length === 1 ? "relationship" : "relationships"}
          </summary>
          <div className="space-y-2 border-t border-slate-100 p-2">
            {rest.map((steps, i) => (
              <RelationshipPath
                key={i}
                steps={steps}
                genders={genders}
                birthYears={birthYears}
                birthOrders={birthOrders}
                sourceId={sourceId}
                peopleById={peopleById}
                sourceLabel={sourceLabel}
                possessive={possessive}
              />
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}
