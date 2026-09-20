import { createClient } from "@/lib/supabase/server";
import {
  softDeletePerson,
  restorePerson,
  mergePeople,
  cleanupSpouseNames,
} from "@/lib/actions/people-admin";
import { Card, Input, Button, Field, ChevronIcon } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { PersonPicker } from "@/components/person-picker";
import { DisambiguatedName } from "@/components/person-name";
import Link from "next/link";

export default async function PeopleManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("people")
    .select("id, public_no, full_name, preferred_name, surname_tag")
    .is("deleted_at", null)
    .order("full_name")
    .limit(200);
  if (q) query = query.ilike("full_name", `%${q}%`);
  const { data: people } = await query;

  const { data: allPeopleForSelect } = await supabase
    .from("people")
    .select("id, public_no, full_name, preferred_name, surname_tag")
    .is("deleted_at", null)
    .order("full_name")
    .limit(2000);

  // Count only, no rows: drives the "Cleanup spouse names" button below so an
  // admin can see exactly how many links it would touch before running it —
  // and so the button can disappear entirely once there's nothing left.
  const { count: legacyNoteCount } = await supabase
    .from("spouses")
    .select("id", { count: "exact", head: true })
    .not("marriage_notes", "is", null)
    .like("marriage_notes", "% married %");

  const { data: deletedPeople } = await supabase
    .from("people")
    .select("id, full_name, preferred_name, surname_tag, delete_reason, deleted_at")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">People Management</h1>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Merge duplicate profiles</h2>
        <p className="mb-3 text-sm text-slate-500">
          Picks the profile to keep; everything pointing at the other one (parents, spouses, children, and any
          linked member account) gets repointed to the keeper, then the duplicate is deleted (recoverable from
          Deleted Profiles below, though its relationships will already have moved to the keeper).
        </p>
        <form action={mergePeople} className="grid gap-3 sm:grid-cols-2">
          <Field label="Keep this profile">
            <PersonPicker name="keeper_id" people={allPeopleForSelect ?? []} />
          </Field>
          <Field label="Delete this duplicate">
            <PersonPicker name="loser_id" people={allPeopleForSelect ?? []} />
          </Field>
          <div className="sm:col-span-2">
            <PendingButton
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              pendingChildren="Merging…"
              confirmMessage="Merge these two profiles? Their relationships can't easily be un-merged."
            >
              Merge
            </PendingButton>
          </div>
        </form>
      </Card>

      <details className="group rounded-lg border border-slate-200 bg-white" open={!!q}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-900">
          <ChevronIcon className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
          Search &amp; delete profiles
        </summary>
        <div className="border-t border-slate-100 p-4">
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
                      <DisambiguatedName person={p} />
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    <details className="inline-block">
                      <summary className="cursor-pointer text-red-600 hover:underline">Delete…</summary>
                      <form action={softDeletePerson} className="mt-2 space-y-2 rounded-md border border-red-200 p-3">
                        <input type="hidden" name="person_id" value={p.id} />
                        <Field label="Reason (logged)"><Input name="reason" required /></Field>
                        <Field label={`Type "${p.full_name}" to confirm`}><Input name="confirm_name" required /></Field>
                        <p className="text-xs text-slate-400">
                          Removes this profile from browsing and search — the data isn&apos;t destroyed, and you can
                          restore it any time from the Deleted Profiles list below.
                        </p>
                        <PendingButton
                          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                          pendingChildren="Deleting…"
                        >
                          Delete
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
      </div>
      </details>

      {/* One-time legacy-import cleanup. Hidden once the count reaches zero,
          so it disappears after it has been run rather than sitting there
          inviting a pointless second press. */}
      {(legacyNoteCount ?? 0) > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Cleanup spouse names</h2>
          <p className="mb-3 text-sm text-slate-500">
            The old site described each marriage as a sentence — &ldquo;X married Y /TAG/, daughter of A and
            B.&rdquo; — and the import kept it verbatim as a note on the spouse link. Every name in it is
            already a real, clickable person shown right above it under Spouse and Parents, so it restates
            the tree in prose and carries <code>{"//"}</code> where a family name was blank. This clears that
            generated text on{" "}
            <strong>
              {legacyNoteCount} spouse link{legacyNoteCount === 1 ? "" : "s"}
            </strong>
            . Notes an admin typed by hand are left alone, no relationship is touched, and the old values are
            written to the Audit Log first.
          </p>
          <form action={cleanupSpouseNames}>
            <PendingButton
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              pendingChildren="Cleaning up…"
              confirmMessage={`Clear the auto-generated marriage notes on ${legacyNoteCount} spouse link${legacyNoteCount === 1 ? "" : "s"}? The previous values are saved to the Audit Log.`}
            >
              Cleanup spouse names
            </PendingButton>
          </form>
        </Card>
      )}

      {deletedPeople && deletedPeople.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Deleted profiles ({deletedPeople.length})</h2>
          <p className="mb-3 text-sm text-slate-500">
            Hidden from browsing and search, but nothing here is actually destroyed.
          </p>
          <ul className="space-y-2">
            {deletedPeople.map((p) => (
              <li key={p.id} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm">
                <div>
                  <span className="text-slate-700">
                    <DisambiguatedName person={p} />
                  </span>
                  {p.delete_reason && <p className="text-xs text-slate-400">{p.delete_reason}</p>}
                </div>
                <form action={restorePerson}>
                  <input type="hidden" name="person_id" value={p.id} />
                  <PendingButton
                    className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    pendingChildren="Restoring…"
                  >
                    Restore
                  </PendingButton>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
