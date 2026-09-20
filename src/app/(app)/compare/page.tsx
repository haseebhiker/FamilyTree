import { createClient } from "@/lib/supabase/server";
import { Card, Field, Button } from "@/components/ui";
import { PersonPicker } from "@/components/person-picker";
import { PersonName } from "@/components/person-name";
import { RelationshipFinder } from "@/components/relationship-finder";
import { findRelationshipPaths } from "@/lib/relationship";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a, b } = await searchParams;
  const supabase = await createClient();

  const { data: people } = await supabase
    .from("people")
    .select("id, public_no, full_name, preferred_name, surname_tag")
    .is("deleted_at", null)
    .order("full_name")
    .limit(2000);

  let result: { paths: ReturnType<typeof findRelationshipPaths>["paths"]; genders: ReturnType<typeof findRelationshipPaths>["genders"] } | null = null;
  let personA: { id: string; full_name: string; preferred_name: string | null; surname_tag: string | null } | undefined;
  let personB: typeof personA;
  let peopleById = new Map<string, NonNullable<typeof personA>>();
  let birthYears = new Map<string, number | null>();
  let birthOrders = new Map<string, number | null>();

  if (a && b && a !== b) {
    personA = (people ?? []).find((p) => p.id === a);
    personB = (people ?? []).find((p) => p.id === b);

    if (personA && personB) {
      const graphPeople: { id: string; father_id: string | null; mother_id: string | null; gender: "M" | "F" | null }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data: page } = await supabase
          .from("people")
          .select("id, father_id, mother_id, gender")
          .is("deleted_at", null)
          .range(from, from + 999);
        if (!page || page.length === 0) break;
        graphPeople.push(...page);
        if (page.length < 1000) break;
      }
      const graphSpouses: { person_a_id: string; person_b_id: string }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data: page } = await supabase.from("spouses").select("person_a_id, person_b_id").range(from, from + 999);
        if (!page || page.length === 0) break;
        graphSpouses.push(...page);
        if (page.length < 1000) break;
      }

      const { paths, genders } = findRelationshipPaths(graphPeople, graphSpouses, a, b, 10);
      result = { paths, genders };

      // personA (the source, per findRelationshipPaths's a/b args above) is
      // included too — Tamil sibling/aunt/uncle terms need personA's own
      // birth_year to compare ages, and personA isn't otherwise a step in
      // their own relationship path.
      const involvedIds = [...new Set([...paths.flat().map((s) => s.id), a])];
      const { data: involvedPeople } = await supabase
        .from("people")
        .select("id, full_name, preferred_name, surname_tag, birth_year, birth_order")
        .in("id", involvedIds.length ? involvedIds : ["-"]);
      peopleById = new Map((involvedPeople ?? []).map((p) => [p.id, p]));
      birthYears = new Map((involvedPeople ?? []).map((p) => [p.id, p.birth_year]));
      birthOrders = new Map((involvedPeople ?? []).map((p) => [p.id, p.birth_order]));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Compare relationship</h1>
        <p className="mt-1 text-sm text-slate-500">Pick any two people to see every way they&apos;re connected.</p>
      </div>

      <Card>
        <form method="GET" className="grid gap-3 sm:grid-cols-2">
          <Field label="Person A">
            <PersonPicker name="a" people={people ?? []} defaultPersonId={a} placeholder="Search by name…" autoFocus />
          </Field>
          <Field label="Person B">
            <PersonPicker name="b" people={people ?? []} defaultPersonId={b} placeholder="Search by name…" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">Compare</Button>
          </div>
        </form>
      </Card>

      {a && b && a === b && (
        <Card>
          <p className="text-sm text-slate-500">Pick two different people to compare.</p>
        </Card>
      )}

      {a && b && a !== b && (!personA || !personB) && (
        <Card>
          <p className="text-sm text-slate-500">Couldn&apos;t find one of those profiles.</p>
        </Card>
      )}

      {result && personA && personB && (
        result.paths.length > 0 ? (
          <RelationshipFinder
            title="How they're related"
            paths={result.paths}
            genders={result.genders}
            birthYears={birthYears}
            birthOrders={birthOrders}
            sourceId={personA.id}
            peopleById={peopleById}
            sourceLabel={<PersonName person={personA} />}
            possessive={`${personA.preferred_name ?? personA.full_name}'s`}
          />
        ) : (
          <Card>
            <p className="text-sm text-slate-500">
              No connection found between <PersonName person={personA} /> and <PersonName person={personB} /> in the
              recorded tree.
            </p>
          </Card>
        )
      )}
    </div>
  );
}
