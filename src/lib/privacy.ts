import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactDetail, Member, Person, PrivacyField, PrivacyVisibility } from "@/lib/types";
import { PRIVACY_FIELDS } from "@/lib/types";
import { decryptValue } from "@/lib/vault-crypto";

// A PRIVACY_FIELDS entry is a *setting name*, not always a literal Person
// property — birth_date/death_date each bundle 3 real columns (year/month/
// day), so redacting them means nulling all 3, not a non-existent
// "birth_date" property.
const PRIVACY_FIELD_TO_PERSON_KEYS: Record<PrivacyField, (keyof Person)[]> = {
  birth_date: ["birth_year", "birth_month", "birth_day"],
  death_date: ["death_year", "death_month", "death_day"],
  current_location: ["current_location"],
  facebook_url: ["facebook_url"],
  linkedin_url: ["linkedin_url"],
  place_of_birth: ["place_of_birth"],
  place_of_death: ["place_of_death"],
};

async function getViewerApprovedGroupIds(supabase: SupabaseClient, viewerId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("group_memberships")
    .select("group_id")
    .eq("member_id", viewerId)
    .eq("status", "approved");
  return new Set((data ?? []).map((m) => m.group_id as string));
}

function isVisibleToViewer(
  visibility: PrivacyVisibility,
  allowedGroupIds: string[],
  viewerGroupIds: Set<string>,
): boolean {
  if (visibility === "everyone") return true;
  if (visibility === "groups") return allowedGroupIds.some((id) => viewerGroupIds.has(id));
  return false; // admins_only / just_me — caller already short-circuits owner/admin before reaching here
}

/**
 * Applies design doc §5's per-field privacy rules: for each sensitive
 * field, hide it from the viewer unless they're the field's owner, an
 * admin, the field is set to "everyone", or it's set to "groups" and the
 * viewer belongs to one of the allowed groups. Core identity/relationship
 * fields are never touched here — callers should always include
 * name/parents/spouse/children regardless.
 */
export async function applyPrivacy(
  supabase: SupabaseClient,
  person: Person,
  viewer: Member | null,
): Promise<Person> {
  const isOwner = !!viewer?.person_id && viewer.person_id === person.id;
  const viewerIsAdmin = viewer?.role === "admin" || viewer?.role === "super_admin";

  if (isOwner || viewerIsAdmin) return person;

  const [{ data: overrides }, { data: defaults }] = await Promise.all([
    supabase.from("field_privacy").select("id, field_name, visibility").eq("person_id", person.id),
    supabase.from("privacy_defaults").select("field_name, visibility"),
  ]);

  const overrideRows = overrides ?? [];
  const groupVisibleIds = overrideRows.filter((o) => o.visibility === "groups").map((o) => o.id);

  const [{ data: groupLinks }, viewerGroupIds] = await Promise.all([
    groupVisibleIds.length > 0
      ? supabase.from("field_privacy_groups").select("field_privacy_id, group_id").in("field_privacy_id", groupVisibleIds)
      : Promise.resolve({ data: [] as { field_privacy_id: string; group_id: string }[] }),
    viewer ? getViewerApprovedGroupIds(supabase, viewer.id) : Promise.resolve(new Set<string>()),
  ]);

  const overrideMap = new Map(overrideRows.map((o) => [o.field_name, o as { id: string; visibility: PrivacyVisibility }]));
  const defaultMap = new Map((defaults ?? []).map((d) => [d.field_name, d.visibility as PrivacyVisibility]));
  const groupsByFieldPrivacyId = new Map<string, string[]>();
  for (const link of groupLinks ?? []) {
    const list = groupsByFieldPrivacyId.get(link.field_privacy_id) ?? [];
    list.push(link.group_id);
    groupsByFieldPrivacyId.set(link.field_privacy_id, list);
  }

  const redacted: Person = { ...person };
  for (const field of PRIVACY_FIELDS) {
    const override = overrideMap.get(field);
    const visibility = override?.visibility ?? defaultMap.get(field) ?? "admins_only";
    const allowedGroupIds = override ? groupsByFieldPrivacyId.get(override.id) ?? [] : [];
    if (isVisibleToViewer(visibility, allowedGroupIds, viewerGroupIds)) continue;
    for (const key of PRIVACY_FIELD_TO_PERSON_KEYS[field]) {
      (redacted as unknown as Record<string, unknown>)[key] = null;
    }
  }
  return redacted;
}

/**
 * Batch version of applyPrivacy's redaction logic for an "everyone" (i.e.
 * not the owner, not an admin, no group membership context) viewer,
 * applied to every person at once — used by the offline tree export.
 * "groups"-scoped fields are always redacted here since the export has no
 * single viewer to check group membership against.
 */
export function redactForPublicExport(
  people: Person[],
  allOverrides: { person_id: string; field_name: string; visibility: PrivacyVisibility }[],
  defaults: { field_name: string; visibility: PrivacyVisibility }[],
): Person[] {
  const overrideMap = new Map<string, PrivacyVisibility>();
  for (const o of allOverrides) overrideMap.set(`${o.person_id}:${o.field_name}`, o.visibility);
  const defaultMap = new Map(defaults.map((d) => [d.field_name, d.visibility]));

  return people.map((person) => {
    const redacted: Person = { ...person };
    for (const field of PRIVACY_FIELDS) {
      const visibility = overrideMap.get(`${person.id}:${field}`) ?? defaultMap.get(field) ?? "admins_only";
      if (visibility === "everyone") continue;
      for (const key of PRIVACY_FIELD_TO_PERSON_KEYS[field]) {
        (redacted as unknown as Record<string, unknown>)[key] = null;
      }
    }
    return redacted;
  });
}

/**
 * Filters a person's contact_details rows (phone/email/address, each with
 * its own visibility — see schema.sql) down to what this viewer may see,
 * and decrypts the `value` of the ones that survive (never decrypts
 * entries the viewer isn't allowed to see). The owner and any admin see
 * everything.
 */
export async function filterAndDecryptContactDetails(
  supabase: SupabaseClient,
  details: ContactDetail[],
  person: Pick<Person, "id">,
  viewer: Member | null,
): Promise<ContactDetail[]> {
  const isOwner = !!viewer?.person_id && viewer.person_id === person.id;
  const viewerIsAdmin = viewer?.role === "admin" || viewer?.role === "super_admin";

  let visible: ContactDetail[];
  if (isOwner || viewerIsAdmin) {
    visible = details;
  } else {
    const groupVisible = details.filter((d) => d.visibility === "groups");
    const [{ data: groupLinks }, viewerGroupIds] = await Promise.all([
      groupVisible.length > 0
        ? supabase
            .from("contact_detail_groups")
            .select("contact_detail_id, group_id")
            .in("contact_detail_id", groupVisible.map((d) => d.id))
        : Promise.resolve({ data: [] as { contact_detail_id: string; group_id: string }[] }),
      viewer ? getViewerApprovedGroupIds(supabase, viewer.id) : Promise.resolve(new Set<string>()),
    ]);

    const groupsByContactId = new Map<string, string[]>();
    for (const link of groupLinks ?? []) {
      const list = groupsByContactId.get(link.contact_detail_id) ?? [];
      list.push(link.group_id);
      groupsByContactId.set(link.contact_detail_id, list);
    }

    visible = details.filter((d) =>
      isVisibleToViewer(d.visibility, groupsByContactId.get(d.id) ?? [], viewerGroupIds),
    );
  }

  return visible.map((d) => ({ ...d, value: decryptValue(d.value) }));
}
