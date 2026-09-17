import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isSuperAdmin } from "@/lib/members";
import { revokeInvite, deleteInvite, linkMemberToPerson, linkInviteToPerson, sendInviteReminderEmails } from "@/lib/actions/invites";
import { Badge, ChevronIcon } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { ActionButton } from "@/components/action-button";
import { PersonPicker } from "@/components/person-picker";
import { PersonName } from "@/components/person-name";
import { LocalTime } from "@/components/local-time";
import { InviteEmailComposer } from "@/components/invite-email-composer";

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
    .select("id, full_name, preferred_name, surname_tag")
    .is("deleted_at", null)
    .order("full_name")
    .limit(2000);

  const { data: members } = await supabase
    .from("members")
    .select("*")
    .order("last_login_at", { ascending: false });

  const peopleById = new Map((people ?? []).map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Invite Management</h1>
        <Link
          href="/admin/invites/new"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          + Invite someone new
        </Link>
      </div>

      <details className="group rounded-lg border border-slate-200 bg-white" open>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-900">
          <ChevronIcon className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
          Current members ({members?.filter((m) => m.status === "active").length ?? 0})
        </summary>
        <p className="px-4 text-xs text-slate-500">Everyone who has ever been approved to sign in, and whether they still can.</p>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 pr-4 font-medium">Linked profile</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Joined</th>
                <th className="py-2 pr-4 font-medium">Last signed in</th>
                <th className="py-2 pr-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {members?.map((m) => {
                const linkedPerson = m.person_id ? peopleById.get(m.person_id) : null;
                return (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{m.name}</td>
                  <td className="py-2 pr-4 text-slate-600">{m.email}</td>
                  <td className="py-2 pr-4 text-slate-600">{m.role.replace(/_/g, " ")}</td>
                  <td className="py-2 pr-4 text-slate-600">
                    {linkedPerson ? (
                      <PersonName person={linkedPerson} />
                    ) : canAssignAdmin ? (
                      <form action={linkMemberToPerson} className="flex items-center gap-1">
                        <input type="hidden" name="member_id" value={m.id} />
                        <div className="w-40">
                          <PersonPicker name="person_id" people={people ?? []} placeholder="Search…" />
                        </div>
                        <PendingButton
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          pendingChildren="…"
                        >
                          Link
                        </PendingButton>
                      </form>
                    ) : (
                      <span className="italic text-slate-400">Not linked</span>
                    )}
                  </td>
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
                        <ActionButton
                          action={revokeInvite}
                          fields={{ invite_id: m.invite_id }}
                          className="text-sm text-red-600 hover:underline"
                          pendingChildren="Revoking…"
                          confirmMessage={`Revoke ${m.name}'s access? They won't be able to sign in again.`}
                        >
                          Revoke access
                        </ActionButton>
                      )}
                  </td>
                </tr>
                );
              })}
              {!members?.length && (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-slate-500">
                    No one has signed in yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>

      <details className="group rounded-lg border border-slate-200 bg-white" open>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-900">
          <ChevronIcon className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
          All invites
        </summary>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 pr-4 font-medium">Linked profile</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {invites?.map((invite) => {
                const linkedPerson = invite.person_id ? peopleById.get(invite.person_id) : null;
                return (
                <tr key={invite.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{invite.name}</td>
                  <td className="py-2 pr-4 text-slate-600">{invite.email}</td>
                  <td className="py-2 pr-4 text-slate-600">{invite.role}</td>
                  <td className="py-2 pr-4 text-slate-600">
                    {linkedPerson ? (
                      <PersonName person={linkedPerson} />
                    ) : canAssignAdmin ? (
                      <form action={linkInviteToPerson} className="flex items-center gap-1">
                        <input type="hidden" name="invite_id" value={invite.id} />
                        <div className="w-40">
                          <PersonPicker name="person_id" people={people ?? []} placeholder="Search…" />
                        </div>
                        <PendingButton
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          pendingChildren="…"
                        >
                          Link
                        </PendingButton>
                      </form>
                    ) : (
                      <span className="italic text-slate-400">Not linked</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">{statusBadge(invite.status)}</td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-3">
                      {invite.status !== "revoked" &&
                        (canAssignAdmin || invite.role === "member") && (
                          <ActionButton
                            action={revokeInvite}
                            fields={{ invite_id: invite.id }}
                            className="text-sm text-red-600 hover:underline"
                            pendingChildren="Revoking…"
                            confirmMessage={`Revoke ${invite.name}'s access?`}
                          >
                            Revoke
                          </ActionButton>
                        )}
                      {!linkedPerson && (canAssignAdmin || invite.role === "member") && (
                        <ActionButton
                          action={deleteInvite}
                          fields={{ invite_id: invite.id }}
                          className="text-sm text-red-600 hover:underline"
                          pendingChildren="Deleting…"
                          confirmMessage={`Permanently delete ${invite.name}'s invite record? This can't be undone. (If they're already an active member, this will fail on purpose — nothing to clean up there.)`}
                        >
                          Delete
                        </ActionButton>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
              {!invites?.length && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500">
                    No invites yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>

      <InviteEmailComposer
        invites={(invites ?? []).filter((i) => i.status === "pending")}
        sendInviteReminderEmails={sendInviteReminderEmails}
      />
    </div>
  );
}
