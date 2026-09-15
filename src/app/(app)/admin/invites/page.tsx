import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isSuperAdmin } from "@/lib/members";
import { createInvite, revokeInvite } from "@/lib/actions/invites";
import { Card, Field, Input, Select, Button, Badge } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { PersonPicker } from "@/components/person-picker";
import { LocalTime } from "@/components/local-time";

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    accepted: "bg-green-100 text-green-800",
    revoked: "bg-slate-200 text-slate-600",
  };
  return <Badge className={styles[status] ?? ""}>{status}</Badge>;
}

export default async function InvitesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMember(supabase, user!.id);
  const canAssignAdmin = isSuperAdmin(member);

  const { data: invites } = await supabase
    .from("invites")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: people } = await supabase
    .from("people")
    .select("id, full_name, surname_tag")
    .is("deleted_at", null)
    .order("full_name")
    .limit(2000);

  const { data: members } = await supabase
    .from("members")
    .select("*")
    .order("last_login_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Invite Management</h1>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Invite someone new</h2>
        <form action={createInvite} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input name="name" required placeholder="Full name" />
          </Field>
          <Field label="Google account email">
            <Input name="email" type="email" required placeholder="name@gmail.com" />
          </Field>
          <p className="text-xs text-slate-400 sm:col-span-2 sm:-mt-2">
            Doesn&apos;t need to be @gmail.com — any email that has a Google account linked to it works (many people
            already have one without realizing, e.g. from YouTube or Google Drive).
          </p>
          <Field label="Role">
            <Select name="role" defaultValue="member" disabled={!canAssignAdmin}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <Field label="Link to existing tree profile (optional)">
            <PersonPicker name="person_id" people={people ?? []} placeholder="Search 1,000+ people by name…" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">Send invite</Button>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Current members ({members?.filter((m) => m.status === "active").length ?? 0})</h2>
        <p className="mb-3 text-xs text-slate-500">Everyone who has ever been approved to sign in, and whether they still can.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Joined</th>
                <th className="py-2 pr-4 font-medium">Last signed in</th>
                <th className="py-2 pr-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {members?.map((m) => (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{m.name}</td>
                  <td className="py-2 pr-4 text-slate-600">{m.email}</td>
                  <td className="py-2 pr-4 text-slate-600">{m.role.replace(/_/g, " ")}</td>
                  <td className="py-2 pr-4">
                    <Badge className={m.status === "active" ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"}>
                      {m.status}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap text-slate-500">
                    <LocalTime iso={m.created_at} />
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap text-slate-500">
                    <LocalTime iso={m.last_login_at} />
                  </td>
                  <td className="py-2 pr-4">
                    {m.status === "active" &&
                      m.invite_id &&
                      m.role !== "super_admin" &&
                      (canAssignAdmin || m.role === "member") && (
                        <form action={revokeInvite}>
                          <input type="hidden" name="invite_id" value={m.invite_id} />
                          <PendingButton
                            className="text-sm text-red-600 hover:underline"
                            pendingChildren="Revoking…"
                            confirmMessage={`Revoke ${m.name}'s access? They won't be able to sign in again.`}
                          >
                            Revoke access
                          </PendingButton>
                        </form>
                      )}
                  </td>
                </tr>
              ))}
              {!members?.length && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-slate-500">
                    No one has signed in yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">All invites</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {invites?.map((invite) => (
                <tr key={invite.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{invite.name}</td>
                  <td className="py-2 pr-4 text-slate-600">{invite.email}</td>
                  <td className="py-2 pr-4 text-slate-600">{invite.role}</td>
                  <td className="py-2 pr-4">{statusBadge(invite.status)}</td>
                  <td className="py-2 pr-4">
                    {invite.status !== "revoked" &&
                      (canAssignAdmin || invite.role === "member") && (
                        <form action={revokeInvite}>
                          <input type="hidden" name="invite_id" value={invite.id} />
                          <PendingButton
                            className="text-sm text-red-600 hover:underline"
                            pendingChildren="Revoking…"
                            confirmMessage={`Revoke ${invite.name}'s access?`}
                          >
                            Revoke
                          </PendingButton>
                        </form>
                      )}
                  </td>
                </tr>
              ))}
              {!invites?.length && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500">
                    No invites yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
