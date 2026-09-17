import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clearAuditLog } from "@/lib/actions/audit-log";
import { Card, Field, Select, Button } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { LocalTime } from "@/components/local-time";
import { DisambiguatedName } from "@/components/person-name";
import { PersonPicker } from "@/components/person-picker";
import { describeChange, referencedPersonIds } from "@/lib/describe-change";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ person_id?: string; submitted_by?: string; performed_by?: string }>;
}) {
  const { person_id: personIdFilter, submitted_by: submittedByFilter, performed_by: performedByFilter } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("audit_log")
    .select("*, members!audit_log_performed_by_fkey(name), submitter:members!audit_log_submitted_by_fkey(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (personIdFilter) query = query.eq("person_id", personIdFilter);
  if (submittedByFilter) query = query.eq("submitted_by", submittedByFilter);
  if (performedByFilter) query = query.eq("performed_by", performedByFilter);
  const { data: entries } = await query;

  const personIds = new Set<string>();
  for (const e of entries ?? []) {
    if (e.person_id) personIds.add(e.person_id);
    for (const id of referencedPersonIds(e.new_value)) personIds.add(id);
  }
  const { data: people } =
    personIds.size > 0
      ? await supabase.from("people").select("id, full_name, preferred_name, surname_tag").in("id", Array.from(personIds))
      : { data: [] };
  const peopleById = new Map((people ?? []).map((p) => [p.id, p]));

  // For the filter controls — every person (to search "whose record" by
  // name) and every member (a plain dropdown is enough there; far fewer of
  // them than there are people in the tree).
  const { data: allPeopleForPicker } = await supabase
    .from("people")
    .select("id, full_name, preferred_name, surname_tag")
    .is("deleted_at", null)
    .order("full_name")
    .limit(2000);
  const { data: allMembers } = await supabase.from("members").select("id, name").order("name");

  const hasFilters = !!(personIdFilter || submittedByFilter || performedByFilter);
  const filteredPersonName = personIdFilter ? peopleById.get(personIdFilter)?.full_name : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Audit Log</h1>
          <p className="mt-1 text-sm text-slate-500">Kept forever unless you clear it — no automatic expiry.</p>
        </div>
        {entries && entries.length > 0 && (
          <form action={clearAuditLog}>
            <PendingButton
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
              pendingChildren="Clearing…"
              confirmMessage="Clear the entire audit log? This can't be undone."
            >
              Clear log
            </PendingButton>
          </form>
        )}
      </div>

      <Card>
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <Field label="Whose record">
            <div className="w-56">
              <PersonPicker
                name="person_id"
                people={allPeopleForPicker ?? []}
                defaultPersonId={personIdFilter}
                placeholder="Search by name…"
              />
            </div>
          </Field>
          <Field label="Submitted by">
            <Select name="submitted_by" defaultValue={submittedByFilter ?? ""} className="w-40">
              <option value="">Anyone</option>
              {allMembers?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Applied by">
            <Select name="performed_by" defaultValue={performedByFilter ?? ""} className="w-40">
              <option value="">Anyone</option>
              {allMembers?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">Filter</Button>
          {hasFilters && (
            <Link href="/admin/audit-log" className="text-sm text-slate-500 hover:text-slate-700 hover:underline">
              Clear filters
            </Link>
          )}
        </form>
        {hasFilters && (
          <p className="mt-2 text-xs text-slate-400">
            {filteredPersonName && <>Whose record: {filteredPersonName}. </>}
            {submittedByFilter && <>Submitted by: {allMembers?.find((m) => m.id === submittedByFilter)?.name}. </>}
            {performedByFilter && <>Applied by: {allMembers?.find((m) => m.id === performedByFilter)?.name}. </>}
          </p>
        )}
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">When (your local time)</th>
                <th className="py-2 pr-4 font-medium">Person</th>
                <th className="py-2 pr-4 font-medium">Change</th>
                <th className="py-2 pr-4 font-medium">What changed</th>
                <th className="py-2 pr-4 font-medium">Submitted by</th>
                <th className="py-2 pr-4 font-medium">Applied by</th>
              </tr>
            </thead>
            <tbody>
              {entries?.map((e) => {
                const person = e.person_id ? peopleById.get(e.person_id) : null;
                const details = describeChange(e.change_type, e.new_value, e.person_id, e.old_value, peopleById);
                return (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 whitespace-nowrap text-slate-500">
                      <LocalTime iso={e.created_at} />
                    </td>
                    <td className="py-2 pr-4">
                      {person ? (
                        <Link href={`/people/${person.id}`} className="hover:underline">
                          <DisambiguatedName person={person} />
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{e.change_type.replace(/_/g, " ")}</td>
                    <td className="py-2 pr-4 max-w-xs text-slate-600">{details}</td>
                    <td className="py-2 pr-4">{e.submitter?.name ?? "—"}</td>
                    <td className="py-2 pr-4">{e.members?.name ?? "—"}</td>
                  </tr>
                );
              })}
              {!entries?.length && (
                <tr><td colSpan={6} className="py-4 text-center text-slate-500">No changes recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
