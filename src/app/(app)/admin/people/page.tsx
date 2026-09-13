import { createClient } from "@/lib/supabase/server";
import { hardDeletePerson, mergePeople } from "@/lib/actions/people-admin";
import { Card, Input, Select, Button, Field } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import Link from "next/link";

export default async function PeopleManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("people").select("id, full_name, surname_tag").order("full_name").limit(200);
  if (q) query = query.ilike("full_name", `%${q}%`);
  const { data: people } = await query;

  const { data: allPeopleForSelect } = await supabase
    .from("people")
    .select("id, full_name, surname_tag")
    .order("full_name")
    .limit(2000);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">People Management</h1>

      <Card>
        <form className="flex gap-2">
          <Input name="q" defaultValue={q ?? ""} placeholder="Search by name…" />
          <Button type="submit">Search</Button>
        </form>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {people?.map((p) => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">
                    <Link href={`/people/${p.id}`} className="hover:underline">
                      {p.full_name}
                      {p.surname_tag ? ` /${p.surname_tag}/` : ""}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    <details className="inline-block">
                      <summary className="cursor-pointer text-red-600 hover:underline">Delete…</summary>
                      <form action={hardDeletePerson} className="mt-2 space-y-2 rounded-md border border-red-200 p-3">
                        <input type="hidden" name="person_id" value={p.id} />
                        <Field label="Reason (logged)"><Input name="reason" required /></Field>
                        <Field label={`Type "${p.full_name}" to confirm`}><Input name="confirm_name" required /></Field>
                        <PendingButton
                          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                          pendingChildren="Deleting…"
                        >
                          Permanently delete
                        </PendingButton>
                      </form>
                    </details>
                  </td>
                </tr>
              ))}
              {!people?.length && (
                <tr><td colSpan={2} className="py-4 text-center text-slate-500">No matches.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Merge duplicate profiles</h2>
        <p className="mb-3 text-sm text-slate-500">
          Picks the profile to keep; everything pointing at the other one (parents, spouses, children, and any
          linked member account) gets repointed to the keeper, then the duplicate is deleted.
        </p>
        <form action={mergePeople} className="grid gap-3 sm:grid-cols-2">
          <Field label="Keep this profile">
            <Select name="keeper_id" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {allPeopleForSelect?.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}{p.surname_tag ? ` /${p.surname_tag}/` : ""}</option>
              ))}
            </Select>
          </Field>
          <Field label="Delete this duplicate">
            <Select name="loser_id" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {allPeopleForSelect?.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}{p.surname_tag ? ` /${p.surname_tag}/` : ""}</option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <PendingButton
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              pendingChildren="Merging…"
              confirmMessage="Merge these two profiles? This can't be undone."
            >
              Merge
            </PendingButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
