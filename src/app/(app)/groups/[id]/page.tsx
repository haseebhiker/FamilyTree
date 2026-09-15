import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import {
  approveGroupMembership,
  rejectGroupMembership,
  addMemberToGroup,
  removeMemberFromGroup,
  promoteToGroupAdmin,
} from "@/lib/actions/groups";
import { Card, Select, Button, Badge } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMember(supabase, user!.id);

  const { data: group } = await supabase.from("groups").select("*").eq("id", id).maybeSingle();
  if (!group) notFound();

  const { data: memberships, error: membershipsError } = await supabase
    .from("group_memberships")
    .select("*, members(id, name, email)")
    .eq("group_id", id)
    .order("requested_at");
  if (membershipsError) console.error("[groups/[id]] memberships query error:", membershipsError);

  const myMembership = memberships?.find((m) => m.member_id === member!.id);
  const isGroupAdmin = myMembership?.role === "admin" && myMembership.status === "approved";
  const canManage = isGroupAdmin || isAdmin(member);

  const approved = memberships?.filter((m) => m.status === "approved") ?? [];
  const pending = memberships?.filter((m) => m.status === "pending") ?? [];

  const { data: allMembers } = canManage
    ? await supabase.from("members").select("id, name, email").order("name")
    : { data: [] };
  const currentMemberIds = new Set((memberships ?? []).map((m) => m.member_id));
  const addableMembers = (allMembers ?? []).filter((m) => !currentMemberIds.has(m.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          {group.name}{" "}
          <Badge className={group.is_public ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}>
            {group.is_public ? "public" : "private"}
          </Badge>
        </h1>
        {group.description && <p className="mt-1 text-sm text-slate-500">{group.description}</p>}
      </div>

      {canManage && pending.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Pending requests ({pending.length})</h2>
          <ul className="space-y-2">
            {pending.map((m) => (
              <li key={m.id} className="flex items-center justify-between text-sm">
                <span>{m.members?.name} ({m.members?.email})</span>
                <span className="flex gap-2">
                  <form action={approveGroupMembership}>
                    <input type="hidden" name="group_id" value={group.id} />
                    <input type="hidden" name="membership_id" value={m.id} />
                    <PendingButton
                      className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
                      pendingChildren="…"
                    >
                      Approve
                    </PendingButton>
                  </form>
                  <form action={rejectGroupMembership}>
                    <input type="hidden" name="group_id" value={group.id} />
                    <input type="hidden" name="membership_id" value={m.id} />
                    <PendingButton className="text-xs text-red-600 hover:underline" pendingChildren="…">
                      Reject
                    </PendingButton>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Members ({approved.length})</h2>
        <ul className="space-y-2 text-sm">
          {approved.map((m) => (
            <li key={m.id} className="flex items-center justify-between">
              <span>
                {m.members?.name}
                {m.role === "admin" && <Badge className="ml-2 bg-slate-100 text-slate-700">admin</Badge>}
              </span>
              {canManage && m.member_id !== member!.id && (
                <span className="flex gap-2">
                  {m.role !== "admin" && (
                    <form action={promoteToGroupAdmin}>
                      <input type="hidden" name="group_id" value={group.id} />
                      <input type="hidden" name="membership_id" value={m.id} />
                      <PendingButton className="text-xs text-slate-600 hover:underline" pendingChildren="…">
                        Make admin
                      </PendingButton>
                    </form>
                  )}
                  <form action={removeMemberFromGroup}>
                    <input type="hidden" name="group_id" value={group.id} />
                    <input type="hidden" name="membership_id" value={m.id} />
                    <PendingButton
                      className="text-xs text-red-600 hover:underline"
                      pendingChildren="…"
                      confirmMessage="Remove this person from the group?"
                    >
                      Remove
                    </PendingButton>
                  </form>
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {canManage && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Add someone directly</h2>
          <form action={addMemberToGroup} className="flex gap-2">
            <input type="hidden" name="group_id" value={group.id} />
            <Select name="member_id" required defaultValue="" className="max-w-xs">
              <option value="" disabled>Choose a member…</option>
              {addableMembers.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
              ))}
            </Select>
            <Button type="submit">Add</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
