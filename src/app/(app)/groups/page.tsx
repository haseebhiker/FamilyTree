import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import { createGroup } from "@/lib/actions/groups";
import { Card, Field, Input, Textarea, Button, Badge, ChevronIcon } from "@/components/ui";

export default async function GroupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMember(supabase, user!.id);

  const [{ data: groups }, { data: counts }] = await Promise.all([
    supabase.from("groups").select("*").order("name"),
    supabase.from("group_people").select("group_id"),
  ]);

  const countByGroup = new Map<string, number>();
  for (const row of counts ?? []) {
    countByGroup.set(row.group_id, (countByGroup.get(row.group_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Groups</h1>
      <p className="text-sm text-slate-500">
        A group is a branch of the family tree (e.g. &quot;grandpa&apos;s tree&quot;) — tag anyone from the 1,000+
        people into one, whether or not they&apos;ve joined the app. Sharing your contact info with a group (see a
        profile&apos;s Privacy settings) is separate from just being tagged in it.
      </p>

      <details className="group rounded-lg border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-900">
          <ChevronIcon className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
          Create a group
        </summary>
        <form action={createGroup} className="space-y-3 border-t border-slate-100 p-4">
          <Field label="Name"><Input name="name" required /></Field>
          <Field label="Description (optional)"><Textarea name="description" rows={2} /></Field>
          {isAdmin(member) && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="is_public" />
              Public group (visible to everyone — only admins can create these)
            </label>
          )}
          {!isAdmin(member) && (
            <p className="text-xs text-slate-400">
              You&apos;ll create a private group — you can tag anyone into it. Only an app admin can create a
              public group.
            </p>
          )}
          <Button type="submit">Create group</Button>
        </form>
      </details>

      <div className="space-y-3">
        {groups?.map((group) => (
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
              <span className="shrink-0 text-sm text-slate-400">
                {countByGroup.get(group.id) ?? 0} tagged
              </span>
            </div>
          </Card>
        ))}
        {!groups?.length && (
          <Card>
            <p className="text-sm text-slate-500">No groups yet — create the first one above.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
