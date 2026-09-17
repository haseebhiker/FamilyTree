import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isSuperAdmin } from "@/lib/members";
import { approveAccessRequest, rejectAccessRequest } from "@/lib/actions/access-requests";
import { Card, Field, Input, Select, Button, Badge } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { PersonPicker } from "@/components/person-picker";
import { DisambiguatedName } from "@/components/person-name";

export default async function AccessRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMember(supabase, user!.id);
  const canAssignAdmin = isSuperAdmin(member);

  const { data: requests } = await supabase
    .from("access_requests")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: people } = await supabase
    .from("people")
    .select("id, full_name, preferred_name, surname_tag")
    .is("deleted_at", null)
    .order("full_name")
    .limit(2000);
  const peopleById = new Map((people ?? []).map((p) => [p.id, p]));

  const pending = requests?.filter((r) => r.status === "pending") ?? [];
  const decided = requests?.filter((r) => r.status !== "pending") ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Access Requests</h1>

      {pending.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">No pending requests.</p>
        </Card>
      )}

      {pending.map((req) => (
        <Card key={req.id}>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <span className="font-medium text-slate-900">{req.name}</span>{" "}
              <span className="text-sm text-slate-500">({req.email})</span>
            </div>
            <span className="text-xs text-slate-400">{new Date(req.created_at).toLocaleDateString()}</span>
          </div>
          {req.known_person_id && peopleById.has(req.known_person_id) && (
            <p className="mb-1 text-sm text-slate-700">
              <span className="font-medium text-slate-500">Says they know: </span>
              <DisambiguatedName person={peopleById.get(req.known_person_id)!} />
            </p>
          )}
          <p className="mb-1 text-sm text-slate-700">
            <span className="font-medium text-slate-500">Relation: </span>
            {req.relation_description}
          </p>
          {req.notes && (
            <p className="mb-3 text-sm text-slate-700">
              <span className="font-medium text-slate-500">Notes: </span>
              {req.notes}
            </p>
          )}

          <form action={approveAccessRequest} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="request_id" value={req.id} />
            <Field label="Role">
              <Select name="role" defaultValue="member" disabled={!canAssignAdmin}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Field label="Link to existing profile (optional)">
              <div className="min-w-56">
                <PersonPicker
                  name="person_id"
                  people={people ?? []}
                  placeholder="Search by name…"
                  defaultPersonId={req.known_person_id ?? undefined}
                />
              </div>
            </Field>
            <PendingButton
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              pendingChildren="Approving…"
            >
              Approve
            </PendingButton>
          </form>
          <form action={rejectAccessRequest} className="mt-2 flex items-center gap-2">
            <input type="hidden" name="request_id" value={req.id} />
            <Input name="admin_note" placeholder="Reason (optional, shown to requester)" className="max-w-sm" />
            <Button type="submit" variant="danger">
              Reject
            </Button>
          </form>
        </Card>
      ))}

      {decided.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Previously decided</h2>
          <ul className="space-y-1 text-sm">
            {decided.map((req) => (
              <li key={req.id} className="flex items-center justify-between">
                <span>
                  {req.name} ({req.email})
                </span>
                <Badge className={req.status === "approved" ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"}>
                  {req.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
