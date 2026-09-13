import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactDetail, Member, Person, PrivacyField, PrivacyVisibility } from "@/lib/types";
import { PRIVACY_FIELDS } from "@/lib/types";

/**
 * Applies design doc §5's per-field privacy rules: for each sensitive
 * field, hide it from the viewer unless they're the field's owner, an
 * admin (when the field is admins_only or has no explicit setting and the
 * profile default falls back to admins_only), or the field is set to
 * "everyone". Core identity/relationship fields are never touched here —
 * callers should always include name/parents/spouse/children regardless.
 */
export async function applyPrivacy(
  supabase: SupabaseClient,
  person: Person,
  viewer: Member | null,
): Promise<Person> {
  const isOwner = !!viewer?.person_id && viewer.person_id === person.id;
  const viewerIsAdmin = viewer?.role === "admin" || viewer?.role === "super_admin";

  if (isOwner || viewerIsAdmin) return person;

  const { data: overrides } = await supabase
    .from("field_privacy")
    .select("field_name, visibility")
    .eq("person_id", person.id);

  const { data: defaults } = await supabase.from("privacy_defaults").select("field_name, visibility");

  const overrideMap = new Map((overrides ?? []).map((o) => [o.field_name, o.visibility as PrivacyVisibility]));
  const defaultMap = new Map((defaults ?? []).map((d) => [d.field_name, d.visibility as PrivacyVisibility]));

  const redacted: Person = { ...person };
  for (const field of PRIVACY_FIELDS) {
    const visibility = overrideMap.get(field) ?? defaultMap.get(field) ?? "everyone";
    if (visibility === "everyone") continue;
    // admins_only and just_me both hide it from a non-owner, non-admin viewer.
    (redacted as unknown as Record<PrivacyField, unknown>)[field] = null;
  }
  return redacted;
}

/**
 * Batch version of applyPrivacy's redaction logic for an "everyone" (i.e.
 * not the owner, not an admin) viewer, applied to every person at once —
 * used by the offline tree export, which has no single logged-in viewer
 * to check against and needs to redact hundreds of rows without a query
 * per person.
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
      const visibility = overrideMap.get(`${person.id}:${field}`) ?? defaultMap.get(field) ?? "everyone";
      if (visibility === "everyone") continue;
      (redacted as unknown as Record<PrivacyField, unknown>)[field] = null;
    }
    return redacted;
  });
}

/**
 * Filters a person's contact_details rows (phone/email/address, each with
 * its own visibility — see schema.sql) down to what this viewer may see.
 * The owner and any admin see everything; anyone else only sees entries
 * explicitly marked "everyone".
 */
export function filterContactDetails(
  details: ContactDetail[],
  person: Pick<Person, "id">,
  viewer: Member | null,
): ContactDetail[] {
  const isOwner = !!viewer?.person_id && viewer.person_id === person.id;
  const viewerIsAdmin = viewer?.role === "admin" || viewer?.role === "super_admin";
  if (isOwner || viewerIsAdmin) return details;
  return details.filter((d) => d.visibility === "everyone");
}
