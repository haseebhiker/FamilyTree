import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import { createGroup, requestToJoinGroup, leaveGroup } from "@/lib/actions/groups";
import { Card, Field, Input, Textarea, Button, Badge } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";

export default async function GroupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMember(supabase, user!.id);

  const [{ data: groups }, { data: myMemberships }] = await Promise.all([
    supabase.from("groups").select("*").order("name"),
    supabase.from("group_memberships").select("group_id, role, status").eq("member_id", member!.id),
  ]);

  const membershipByGroup = new Map((myMemberships ?? []).map((m) => [m.group_id, m]));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Groups</h1>
      <p className="text-sm text-slate-500">
        Belong to as many as you like. Sharing your contact info with a specific group (see a profile&apos;s Privacy
        settings) is separate from just being a member.
      </p>

      <details className="rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900">
          Create a group
        </summary>
        <form action={createGroup} className="space-y-3 border-t border-slate-100 p-4">
          <Field label="Name"><Input name="name" required /></Field>
          <Field label="Description (optional)"><Textarea name="description" rows={2} /></Field>
          {isAdmin(member) && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="is_public" />
              Public group (anyone can find and request to join — only admins can create these)
            </label>
          )}
          {!isAdmin(member) && (
            <p className="text-xs text-slate-400">
              You&apos;ll create a private group — you become its admin and can add people directly. Only an app
              admin can create a public group.
            </p>
          )}
          <Button type="submit">Create group</Button>
        </form>
      </details>

      <div className="space-y-3">
        {groups?.map((group) => {
          const membership = membershipByGroup.get(group.id);
          return (
            <Card key={group.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/groups/${group.id}`} className="font-medium text-slate-900 hover:underline">
                    {group.name}
                  </Link>{" "}
                  <Badge className={group.is_public ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}>
                    {group.is_public ? "public" : "private"}
                  </Badge>
                  {group.description && <p className="mt-1 text-sm text-slate-500">{group.description}</p>}
                </div>
                <div className="shrink-0">
                  {!membership && (
                    <form action={requestToJoinGroup}>
                      <input type="hidden" name="group_id" value={group.id} />
                      <PendingButton
                        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
                        pendingChildren="Requesting…"
                      >
                        Request to join
                      </PendingButton>
                    </form>
                  )}
                  {membership?.status === "pending" && (
                    <Badge className="bg-amber-100 text-amber-800">Request pending</Badge>
                  )}
                  {membership?.status === "approved" && (
                    <form action={leaveGroup}>
                      <input type="hidden" name="group_id" value={group.id} />
                      <PendingButton
                        className="text-sm text-red-600 hover:underline"
                        pendingChildren="Leaving…"
                        confirmMessage="Leave this group?"
                      >
                        {membership.role === "admin" ? "Leave (you're an admin)" : "Leave group"}
                      </PendingButton>
                    </form>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
        {!groups?.length && (
          <Card>
            <p className="text-sm text-slate-500">No groups yet — create the first one above.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
