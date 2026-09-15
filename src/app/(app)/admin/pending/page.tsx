import { createClient } from "@/lib/supabase/server";
import { approvePendingChange, rejectPendingChange } from "@/lib/actions/pending-changes";
import { Card, Input, Button, Badge } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { PersonName } from "@/components/person-name";
import type { PendingChange } from "@/lib/types";

const CHANGE_TYPE_LABELS: Record<string, string> = {
  edit_person: "Edit profile",
  add_person: "Add family member",
  add_relationship: "Add relationship",
  propose_deletion: "Remove profile",
};

function DiffRow({ field, oldValue, newValue, editable }: { field: string; oldValue: unknown; newValue: unknown; editable: boolean }) {
  return (
    <div className="grid grid-cols-[140px_1fr_1fr] gap-2 border-b border-slate-100 py-1.5 text-sm">
      <div className="font-medium text-slate-500">{field.replace(/_/g, " ")}</div>
      <div className="text-red-700 line-through decoration-red-300">
        {oldValue == null || oldValue === "" ? <span className="italic text-slate-400">empty</span> : String(oldValue)}
      </div>
      {editable ? (
        <Input name={`edit_${field}`} defaultValue={newValue == null ? "" : String(newValue)} />
      ) : (
        <div className="text-green-700">
          {newValue == null || newValue === "" ? <span className="italic text-slate-400">empty</span> : String(newValue)}
        </div>
      )}
    </div>
  );
}

export default async function PendingApprovalsPage() {
  const supabase = await createClient();
  const { data: changes } = await supabase
    .from("pending_changes")
    .select("*, members!pending_changes_submitted_by_fkey(name, email)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const targetIds = [
    ...new Set(
      (changes ?? [])
        .flatMap((c) => [c.target_person_id, c.proposed_data?.existing_person_id])
        .filter(Boolean),
    ),
  ];
  const { data: targetPeople } =
    targetIds.length > 0
      ? await supabase.from("people").select("id, full_name, preferred_name, surname_tag").in("id", targetIds)
      : { data: [] };
  const peopleById = new Map((targetPeople ?? []).map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Pending Approvals</h1>

      {!changes?.length && (
        <Card>
          <p className="text-sm text-slate-500">Nothing waiting on review.</p>
        </Card>
      )}

      {changes?.map((change: PendingChange & { members: { name: string; email: string } | null }) => {
        const target = change.target_person_id ? peopleById.get(change.target_person_id) : null;
        const isEditType = change.change_type === "edit_person";
        const proposedEntries = Object.entries(change.proposed_data ?? {});

        return (
          <Card key={change.id}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <Badge className="bg-slate-100 text-slate-700">{CHANGE_TYPE_LABELS[change.change_type]}</Badge>{" "}
                <span className="text-sm text-slate-600">
                  {target ? <PersonName person={target} /> : "New person"}
                </span>
              </div>
              <span className="text-xs text-slate-400">
                Submitted by {change.members?.name ?? "unknown"} on{" "}
                {new Date(change.created_at).toLocaleDateString()}
              </span>
            </div>

            {change.note && (
              <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <span className="font-medium">Note: </span>
                {change.note}
              </p>
            )}

            <form action={approvePendingChange} className="space-y-3">
              <input type="hidden" name="change_id" value={change.id} />

              {isEditType ? (
                <div>
                  <div className="grid grid-cols-[140px_1fr_1fr] gap-2 border-b border-slate-200 pb-1 text-xs font-semibold text-slate-500">
                    <div>Field</div>
                    <div>Current</div>
                    <div>Proposed (editable)</div>
                  </div>
                  {proposedEntries.map(([field, newValue]) => (
                    <DiffRow
                      key={field}
                      field={field}
                      oldValue={change.previous_data?.[field]}
                      newValue={newValue}
                      editable
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-slate-200 p-3 text-sm">
                  {proposedEntries.map(([field, value]) => {
                    const isPersonRef = field === "existing_person_id" || field === "relation_to_person_id";
                    const linkedPerson = isPersonRef && typeof value === "string" ? peopleById.get(value) : null;
                    return (
                      <div key={field} className="border-b border-slate-100 py-1 last:border-0">
                        <span className="font-medium text-slate-500">{field.replace(/_/g, " ")}: </span>
                        {value == null || value === "" ? (
                          <span className="italic text-slate-400">empty</span>
                        ) : linkedPerson ? (
                          <PersonName person={linkedPerson} />
                        ) : (
                          String(value)
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <PendingButton
                  className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  pendingChildren="Approving…"
                >
                  Approve
                </PendingButton>
              </div>
            </form>

            <form action={rejectPendingChange} className="mt-2 flex items-center gap-2">
              <input type="hidden" name="change_id" value={change.id} />
              <Input name="admin_note" placeholder="Reason (optional, shown to submitter)" className="max-w-sm" />
              <Button type="submit" variant="danger">
                Reject
              </Button>
            </form>
          </Card>
        );
      })}
    </div>
  );
}
