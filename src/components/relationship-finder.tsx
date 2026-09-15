import { Fragment } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { PersonName } from "@/components/person-name";
import { stepLabel, describeRelationship, type PathStep, type Gender } from "@/lib/relationship";

interface PersonLite {
  id: string;
  full_name: string;
  preferred_name: string | null;
  surname_tag: string | null;
}

export function RelationshipFinder({
  paths,
  genders,
  peopleById,
}: {
  paths: PathStep[][];
  genders: Map<string, Gender>;
  peopleById: Map<string, PersonLite>;
}) {
  if (paths.length === 0) return null;

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-slate-900">How you&apos;re related</h2>
      {paths.length > 1 && (
        <p className="mb-3 text-xs text-slate-500">Related {paths.length} different ways — see each below.</p>
      )}
      <div className="space-y-2">
        {paths.map((steps, i) => {
          const summary = describeRelationship(steps, genders);
          const last = peopleById.get(steps[steps.length - 1].id);
          return (
            <details key={i} className="rounded-md border border-slate-200 p-3">
              <summary className="cursor-pointer list-none text-sm text-slate-800">
                {summary ? (
                  <>
                    {last ? <PersonName person={last} /> : "They"} is your <span className="font-semibold">{summary}</span>
                  </>
                ) : (
                  <>See the connection ({steps.length} steps)</>
                )}
              </summary>
              <div className="mt-3 flex flex-wrap items-start gap-x-2 gap-y-3 border-t border-slate-100 pt-3 text-xs">
                <div className="text-center">
                  <div className="font-medium text-slate-900">You</div>
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
            </details>
          );
        })}
      </div>
    </Card>
  );
}
