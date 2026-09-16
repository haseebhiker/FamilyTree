import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isSuperAdmin } from "@/lib/members";
import { createInvite } from "@/lib/actions/invites";
import { Card, Field, Input, Select, Button } from "@/components/ui";
import { PersonPicker } from "@/components/person-picker";

export default async function NewInvitePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMember(supabase, user!.id);
  const canAssignAdmin = isSuperAdmin(member);

  const { data: people } = await supabase
    .from("people")
    .select("id, full_name, preferred_name, surname_tag")
    .is("deleted_at", null)
    .order("full_name")
    .limit(2000);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Invite Someone New</h1>

      <Card>
        <form action={createInvite} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input name="name" required placeholder="Full name" autoFocus />
          </Field>
          <Field label="Google account email">
            <Input name="email" type="email" required placeholder="name@gmail.com" />
          </Field>
          <p className="text-xs text-slate-400 sm:col-span-2 sm:-mt-2">
            Doesn&apos;t need to be @gmail.com — any email that has a Google account linked to it works (many people
            already have one without realizing, e.g. from YouTube or Google Drive).
          </p>
          <p className="text-xs text-amber-700 sm:col-span-2 sm:-mt-1">
            This gives them access right away — the moment they sign in with this email, they&apos;re in. There&apos;s
            no separate approval step after this, so only send it to people you&apos;re ready to let in now. (If
            someone should wait for review first, don&apos;t invite them here — let them sign in on their own and
            request access instead, which you can approve from the Access Requests page.)
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
    </div>
  );
}
