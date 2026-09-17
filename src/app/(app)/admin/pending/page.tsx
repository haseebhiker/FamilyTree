import { createClient } from "@/lib/supabase/server";
import { approvePendingChange, rejectPendingChange } from "@/lib/actions/pending-changes";
import { Card, Badge } from "@/components/ui";
import { DisambiguatedName } from "@/components/person-name";
import { PendingChangeApproveForm, PendingChangeApproveRaw, PendingChangeRejectForm } from "@/components/pending-change-forms";
import type { PendingChange } from "@/lib/types";

const CHANGE_TYPE_LABELS: Record<string, string> = {
  edit_person: "Edit profile",
  add_person: "Add family member",
  add_relationship: "Add relationship",
  propose_deletion: "Remove profile",
};

const RELATION_WORD: Record<string, Record<string, string>> = {
  child: { M: "son", F: "daughter" },
  parent: { M: "father", F: "mother" },
  sibling: { M: "brother", F: "sister" },
  spouse: { M: "husband", F: "wife" },
};

/**
 * A plain-English sentence for what a change actually does, since the raw
 * field-by-field dump below it (relation_type, parent_gender,
 * relation_to_person_id, ...) reads like a database export, not a request —
 * admins were mistaking "add a new child" for "re-adding the person whose
 * profile this is" more than once.
 */
function describeChange(
  change: PendingChange,
  peopleById: Map<string, { id: string; full_name: string; preferred_name?: string | null; surname_tag: string | null }>,
): string | null {
  const d = change.proposed_data ?? {};
  const nameOf = (id: unknown) => (typeof id === "string" ? (peopleById.get(id)?.full_name ?? "someone not in the tree") : "someone not in the tree");

  if (change.change_type === "add_person") {
    const relationType = String(d.relation_type ?? "");
    const word = RELATION_WORD[relationType]?.[String(d.gender ?? "")] ?? (relationType || "relative");
    return `Add a new person, ${d.full_name ?? "(unnamed)"}, as ${nameOf(d.relation_to_person_id)}'s ${word}.`;
  }

  if (change.change_type === "add_relationship") {
    if (d.mode === "sibling") {
      return `Make ${nameOf(change.target_person_id)} a sibling of ${nameOf(d.relation_to_person_id)} (same parents).`;
    }
    if (d.mode === "spouse") {
      return `Add ${nameOf(d.existing_person_id)} as ${nameOf(d.relation_to_person_id)}'s spouse.`;
    }
    // The remaining shape covers both directions ("add an existing person as
    // my parent" and "add an existing person as my child") — target_person_id
    // is always who ends up with the new father_id/mother_id link, and
    // existing_person_id is always the person being placed into that slot.
    return `Link ${nameOf(d.existing_person_id)} as a parent of ${nameOf(change.target_person_id)}.`;
  }

  if (change.change_type === "propose_deletion") {
    return `Remove ${nameOf(change.target_person_id)}'s profile from the tree.`;
  }

  return null;
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
        const summary = describeChange(change, peopleById);

        return (
          <Card key={change.id}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <Badge className="bg-slate-100 text-slate-700">{CHANGE_TYPE_LABELS[change.change_type]}</Badge>{" "}
                <span className="text-sm text-slate-600">
                  {target ? <DisambiguatedName person={target} /> : "New person"}
                </span>
              </div>
              <span className="text-xs text-slate-400">
                Submitted by {change.members?.name ?? "unknown"} on{" "}
                {new Date(change.created_at).toLocaleDateString()}
              </span>
            </div>

            {summary && <p className="mb-3 text-sm font-medium text-slate-900">{summary}</p>}

            {change.note && (
              <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <span className="font-medium">Note: </span>
                {change.note}
              </p>
            )}

            {isEditType ? (
              <PendingChangeApproveForm
                changeId={change.id}
                proposedEntries={proposedEntries as [string, unknown][]}
                previousData={change.previous_data}
                approvePendingChange={approvePendingChange}
              />
            ) : (
              <PendingChangeApproveRaw
                changeId={change.id}
                proposedEntries={proposedEntries as [string, unknown][]}
                peopleById={peopleById}
                approvePendingChange={approvePendingChange}
              />
            )}

            <PendingChangeRejectForm changeId={change.id} rejectPendingChange={rejectPendingChange} />
          </Card>
        );
      })}
    </div>
  );
}
