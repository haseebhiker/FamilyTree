import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clearAuditLog } from "@/lib/actions/audit-log";
import { Card } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";

export default async function AuditLogPage() {
  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("audit_log")
    .select("*, members!audit_log_performed_by_fkey(name), submitter:members!audit_log_submitted_by_fkey(name)")
    .order("created_at", { ascending: false })
    .limit(200);

  const personIds = [...new Set((entries ?? []).map((e) => e.person_id).filter(Boolean))];
  const { data: people } =
    personIds.length > 0
      ? await supabase.from("people").select("id, full_name, surname_tag").in("id", personIds)
      : { data: [] };
  const peopleById = new Map((people ?? []).map((p) => [p.id, p]));

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
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">When</th>
                <th className="py-2 pr-4 font-medium">Person</th>
                <th className="py-2 pr-4 font-medium">Change</th>
                <th className="py-2 pr-4 font-medium">Submitted by</th>
                <th className="py-2 pr-4 font-medium">Applied by</th>
              </tr>
            </thead>
            <tbody>
              {entries?.map((e) => {
                const person = e.person_id ? peopleById.get(e.person_id) : null;
                return (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 whitespace-nowrap text-slate-500">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">
                      {person ? (
                        <Link href={`/people/${person.id}`} className="hover:underline">
                          {person.full_name}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{e.change_type.replace(/_/g, " ")}</td>
                    <td className="py-2 pr-4">{e.submitter?.name ?? "—"}</td>
                    <td className="py-2 pr-4">{e.members?.name ?? "—"}</td>
                  </tr>
                );
              })}
              {!entries?.length && (
                <tr><td colSpan={5} className="py-4 text-center text-slate-500">No changes recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
