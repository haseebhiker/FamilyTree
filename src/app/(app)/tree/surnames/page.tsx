import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { DisambiguatedName } from "@/components/person-name";

interface PersonLite {
  id: string;
  full_name: string;
  preferred_name: string | null;
  surname_tag: string | null;
}

export default async function SurnamesPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag } = await searchParams;
  const supabase = await createClient();

  const allPeople: PersonLite[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page } = await supabase
      .from("people")
      .select("id, full_name, preferred_name, surname_tag")
      .is("deleted_at", null)
      .order("full_name")
      .range(from, from + 999);
    if (!page || page.length === 0) break;
    allPeople.push(...page);
    if (page.length < 1000) break;
  }

  const countBySurname = new Map<string, number>();
  for (const p of allPeople) {
    if (!p.surname_tag) continue;
    countBySurname.set(p.surname_tag, (countBySurname.get(p.surname_tag) ?? 0) + 1);
  }
  const surnames = [...countBySurname.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const filtered = tag ? allPeople.filter((p) => p.surname_tag === tag) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-sm font-medium text-slate-600">
        <Link href="/tree" className="hover:text-slate-900">
          Tree
        </Link>
        <span className="text-slate-900">Surnames</span>
      </div>

      {!tag ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Surnames ({surnames.length})</h2>
          <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {surnames.map(([name, count]) => (
              <li key={name}>
                <Link href={`/tree/surnames?tag=${encodeURIComponent(name)}`} className="hover:underline">
                  /{name}/ <span className="text-slate-400">({count})</span>
                </Link>
              </li>
            ))}
            {surnames.length === 0 && <li className="text-slate-400">No surnames recorded yet.</li>}
          </ul>
        </Card>
      ) : (
        <Card>
          <Link href="/tree/surnames" className="text-xs text-slate-400 hover:text-slate-600 hover:underline">
            ← All surnames
          </Link>
          <h2 className="mt-2 mb-3 text-sm font-semibold text-slate-900">
            /{tag}/ ({filtered.length})
          </h2>
          <ul className="space-y-1 text-sm">
            {filtered.map((p) => (
              <li key={p.id}>
                <Link href={`/people/${p.id}`} className="hover:underline">
                  <DisambiguatedName person={p} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
