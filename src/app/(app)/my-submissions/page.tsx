import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/members";
import { Card, Badge } from "@/components/ui";
import { PersonName } from "@/components/person-name";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const CHANGE_TYPE_LABELS: Record<string, string> = {
  edit_person: "Edit profile",
  add_person: "Add family member",
  add_relationship: "Add relationship",
  propose_deletion: "Remove profile",
};

export default async function MySubmissionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMember(supabase, user!.id);

  const { data: changes } = await supabase
    .from("pending_changes")
    .select("*")
    .eq("submitted_by", member!.id)
    .order("created_at", { ascending: false });

  const targetIds = [...new Set((changes ?? []).map((c) => c.target_person_id).filter(Boolean))];
  const { data: targetPeople } =
    targetIds.length > 0
      ? await supabase.from("people").select("id, full_name, preferred_name, surname_tag").in("id", targetIds)
      : { data: [] };
  const peopleById = new Map((targetPeople ?? []).map((p) => [p.id, p]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">My Submissions</h1>
      {!changes?.length && (
        <Card>
          <p className="text-sm text-slate-500">
            You haven&apos;t submitted any edits yet. Open a profile in the tree and use &quot;Suggest an
            edit&quot; to propose a change.
          </p>
        </Card>
      )}
      {changes?.map((change) => {
        const target = change.target_person_id ? peopleById.get(change.target_person_id) : null;
        return (
          <Card key={change.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Badge className="bg-slate-100 text-slate-700">{CHANGE_TYPE_LABELS[change.change_type]}</Badge>{" "}
                <span className="text-sm text-slate-700">
                  {target ? <PersonName person={target} /> : String(change.proposed_data?.full_name ?? "New person")}
                </span>
              </div>
              <Badge className={STATUS_STYLES[change.status]}>{change.status}</Badge>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Submitted {new Date(change.created_at).toLocaleDateString()}
            </p>
            {change.status === "rejected" && change.admin_note && (
              <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{change.admin_note}</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
