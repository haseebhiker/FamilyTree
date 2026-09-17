import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import { addPersonToGroup, removePersonFromGroup } from "@/lib/actions/groups";
import { Card, Button, Badge } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { PersonPicker } from "@/components/person-picker";
import { DisambiguatedName } from "@/components/person-name";

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMember(supabase, user!.id);

  const { data: group } = await supabase.from("groups").select("*").eq("id", id).maybeSingle();
  if (!group) notFound();

  const canManage = isAdmin(member) || group.created_by === member!.id;

  type TaggedPerson = {
    id: string;
    person_id: string;
    people: { id: string; full_name: string; preferred_name: string | null; surname_tag: string | null } | null;
  };
  const { data: taggedRaw, error: taggedError } = await supabase
    .from("group_people")
    .select("id, person_id, people!group_people_person_id_fkey(id, full_name, preferred_name, surname_tag)")
    .eq("group_id", id)
    .order("added_at");
  if (taggedError) console.error("[groups/[id]] group_people query error:", taggedError);
  // PostgREST embeds a to-one relation as a single object, but postgrest-js's
  // string-based type inference can't always tell — asserted here rather
  // than fighting the inferred (wrong) array type.
  const tagged = (taggedRaw ?? []) as unknown as TaggedPerson[];

  const taggedPersonIds = new Set((tagged ?? []).map((t) => t.person_id));

  const { data: allPeopleForPicker } = canManage
    ? await supabase
        .from("people")
        .select("id, full_name, preferred_name, surname_tag")
        .is("deleted_at", null)
        .order("full_name")
        .limit(2000)
    : { data: [] };
  const addablePeople = (allPeopleForPicker ?? []).filter((p) => !taggedPersonIds.has(p.id));

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

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Tagged ({tagged?.length ?? 0})</h2>
        <ul className="space-y-2 text-sm">
          {tagged?.map((t) =>
            t.people ? (
              <li key={t.id} className="flex items-center justify-between">
                <Link href={`/people/${t.people.id}`} className="hover:underline">
                  <DisambiguatedName person={t.people} />
                </Link>
                {canManage && (
                  <form action={removePersonFromGroup}>
                    <input type="hidden" name="group_id" value={group.id} />
                    <input type="hidden" name="group_person_id" value={t.id} />
                    <PendingButton
                      className="text-xs text-red-600 hover:underline"
                      pendingChildren="…"
                      confirmMessage="Remove this person from the group?"
                    >
                      Remove
                    </PendingButton>
                  </form>
                )}
              </li>
            ) : null,
          )}
          {!tagged?.length && <li className="text-slate-400">No one tagged yet.</li>}
        </ul>
      </Card>

      {canManage && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Tag someone</h2>
          <p className="mb-3 text-xs text-slate-500">
            Search anyone in the family tree — they don&apos;t need to have signed in to the app.
          </p>
          <form action={addPersonToGroup} className="flex flex-wrap gap-2">
            <input type="hidden" name="group_id" value={group.id} />
            <div className="w-full max-w-xs">
              <PersonPicker name="person_id" people={addablePeople} placeholder="Search by name…" />
            </div>
            <Button type="submit">Add</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
