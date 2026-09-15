import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import { Card } from "@/components/ui";
import { PersonName } from "@/components/person-name";
import { PrivacySettingsForm } from "@/components/privacy-settings-form";
import type { PrivacyVisibility } from "@/lib/types";
import { PRIVACY_FIELDS } from "@/lib/types";

export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string }>;
}) {
  const { person: personParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMember(supabase, user!.id);

  const targetPersonId = personParam || member?.person_id;
  if (!targetPersonId) {
    return (
      <Card>
        <p className="text-sm text-slate-500">
          Your account isn&apos;t linked to a profile yet, so there&apos;s nothing to set privacy for. Ask an admin
          to link your account from Invite Management.
        </p>
      </Card>
    );
  }

  // Managing someone else's privacy (an unclaimed profile) is admin-only —
  // your own is always allowed regardless of role.
  if (targetPersonId !== member?.person_id && !isAdmin(member)) {
    redirect("/privacy");
  }

  const { data: targetPerson } = await supabase
    .from("people")
    .select("id, full_name, preferred_name, surname_tag")
    .eq("id", targetPersonId)
    .maybeSingle();
  if (!targetPerson) notFound();

  const [{ data: fieldPrivacyRows }, { data: privacyDefaults }, { data: allGroups }, { data: personGroupRows }] =
    await Promise.all([
      supabase.from("field_privacy").select("id, field_name, visibility").eq("person_id", targetPersonId),
      supabase.from("privacy_defaults").select("field_name, visibility"),
      supabase.from("groups").select("id, name").order("name"),
      supabase.from("group_people").select("group_id").eq("person_id", targetPersonId),
    ]);

  const personGroupIds = new Set((personGroupRows ?? []).map((g) => g.group_id));
  const selectableGroups = (allGroups ?? []).filter((g) => personGroupIds.has(g.id));

  const defaultsMap = new Map((privacyDefaults ?? []).map((d) => [d.field_name, d.visibility as PrivacyVisibility]));
  const fieldPrivacyGroupIds = (fieldPrivacyRows ?? []).filter((r) => r.visibility === "groups").map((r) => r.id);
  const { data: fieldPrivacyGroupLinks } =
    fieldPrivacyGroupIds.length > 0
      ? await supabase.from("field_privacy_groups").select("field_privacy_id, group_id").in("field_privacy_id", fieldPrivacyGroupIds)
      : { data: [] as { field_privacy_id: string; group_id: string }[] };

  const currentVisibility: Record<string, PrivacyVisibility> = {};
  const currentGroupIds: Record<string, string[]> = {};
  for (const field of PRIVACY_FIELDS) {
    const row = (fieldPrivacyRows ?? []).find((r) => r.field_name === field);
    currentVisibility[field] = row?.visibility ?? defaultsMap.get(field) ?? "admins_only";
    if (row) {
      currentGroupIds[field] = (fieldPrivacyGroupLinks ?? [])
        .filter((l) => l.field_privacy_id === row.id)
        .map((l) => l.group_id);
    }
  }

  const isOwnProfile = targetPersonId === member?.person_id;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Privacy settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isOwnProfile ? (
            "Choose who can see each field on your profile."
          ) : (
            <>
              Choose who can see each field on <PersonName person={targetPerson} />
              &apos;s profile.
            </>
          )}
        </p>
      </div>
      <Card>
        <PrivacySettingsForm
          personId={targetPerson.id}
          currentVisibility={currentVisibility}
          currentGroupIds={currentGroupIds}
          groups={selectableGroups}
        />
      </Card>
    </div>
  );
}
