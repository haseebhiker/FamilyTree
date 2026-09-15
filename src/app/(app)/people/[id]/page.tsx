import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import { applyPrivacy, filterAndDecryptContactDetails } from "@/lib/privacy";
import { submitPersonEdit, submitAddPerson } from "@/lib/actions/pending-changes";
import { deleteContactDetail } from "@/lib/actions/contact-details";
import { restorePerson } from "@/lib/actions/people-admin";
import { formatPartialDate } from "@/lib/partial-date";
import { formatPhoneForDisplay } from "@/lib/countries";
import { Card, Field, Input, Select, Textarea, Button, Badge } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { ContactDetailForm } from "@/components/contact-detail-form";
import { PrivacySettingsForm } from "@/components/privacy-settings-form";
import { ContactIcons } from "@/components/contact-icons";
import { PersonName, displayNameText } from "@/components/person-name";
import type { ContactDetail, Person, PrivacyVisibility } from "@/lib/types";
import { PRIVACY_FIELDS } from "@/lib/types";

const CONTACT_TYPE_LABELS: Record<string, string> = {
  phone: "Phone",
  email: "Email",
  address: "Address",
};

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMember(supabase, user!.id);

  const { data: personRaw, error: personError } = await supabase.from("people").select("*").eq("id", id).maybeSingle();
  if (personError) console.error("[people/[id]] query error:", personError);
  if (!personRaw) notFound();

  // Soft-deleted: reads exactly like a normal "not here" page to anyone but
  // an admin, on purpose — see softDeletePerson in people-admin.ts. An
  // admin instead sees the full profile plus how/why it was removed and a
  // way to undo it.
  if (personRaw.deleted_at && !isAdmin(member)) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <p className="text-sm text-slate-500">This profile isn&apos;t available.</p>
      </Card>
    );
  }

  const person = await applyPrivacy(supabase, personRaw as Person, member);
  const isOwner = member?.person_id === person.id;
  const canManagePrivacy = isOwner || isAdmin(member);

  const [
    { data: father },
    { data: mother },
    { data: spousesAsA },
    { data: spousesAsB },
    { data: auditEntries },
    { data: contactDetailsRaw },
    { data: fieldPrivacyRows },
    { data: privacyDefaults },
    { data: allGroups },
    { data: ownerMember },
  ] = await Promise.all([
    person.father_id
      ? supabase.from("people").select("id, full_name, preferred_name, surname_tag").eq("id", person.father_id).single()
      : Promise.resolve({ data: null }),
    person.mother_id
      ? supabase.from("people").select("id, full_name, preferred_name, surname_tag").eq("id", person.mother_id).single()
      : Promise.resolve({ data: null }),
    supabase.from("spouses").select("*, person_b:people!spouses_person_b_id_fkey(id, full_name, preferred_name, surname_tag)").eq("person_a_id", person.id),
    supabase.from("spouses").select("*, person_a:people!spouses_person_a_id_fkey(id, full_name, preferred_name, surname_tag)").eq("person_b_id", person.id),
    supabase
      .from("audit_log")
      .select("*, members!audit_log_performed_by_fkey(name)")
      .eq("person_id", person.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("contact_details").select("*").eq("person_id", person.id).order("created_at"),
    supabase.from("field_privacy").select("id, field_name, visibility").eq("person_id", person.id),
    supabase.from("privacy_defaults").select("field_name, visibility"),
    supabase.from("groups").select("id, name").order("name"),
    supabase.from("members").select("id").eq("person_id", person.id).maybeSingle(),
  ]);

  const contactDetails = await filterAndDecryptContactDetails(
    supabase,
    (contactDetailsRaw ?? []) as ContactDetail[],
    person,
    member,
  );

  // Which groups a viewer can pick from when sharing this profile's info —
  // the owner's own approved groups if the profile is claimed, otherwise
  // (an unclaimed profile an admin is managing) every group.
  let selectableGroups = allGroups ?? [];
  if (ownerMember) {
    const { data: ownerMemberships } = await supabase
      .from("group_memberships")
      .select("group_id")
      .eq("member_id", ownerMember.id)
      .eq("status", "approved");
    const ownerGroupIds = new Set((ownerMemberships ?? []).map((m) => m.group_id));
    selectableGroups = (allGroups ?? []).filter((g) => ownerGroupIds.has(g.id));
  }

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

  const marriages = [
    ...(spousesAsA ?? []).map((s) => ({ spouse: s.person_b, marriage_notes: s.marriage_notes, spouseId: s.person_b_id })),
    ...(spousesAsB ?? []).map((s) => ({ spouse: s.person_a, marriage_notes: s.marriage_notes, spouseId: s.person_a_id })),
  ];

  const { data: children } = await supabase
    .from("people")
    .select("id, full_name, preferred_name, surname_tag, father_id, mother_id")
    .or(`father_id.eq.${person.id},mother_id.eq.${person.id}`)
    .order("full_name");

  const siblingConditions = [
    person.father_id ? `father_id.eq.${person.father_id}` : null,
    person.mother_id ? `mother_id.eq.${person.mother_id}` : null,
  ].filter((c): c is string => c !== null);
  const { data: siblingsRaw } =
    siblingConditions.length > 0
      ? await supabase
          .from("people")
          .select("id, full_name, preferred_name, surname_tag, father_id, mother_id")
          .or(siblingConditions.join(","))
          .order("full_name")
      : { data: [] };
  const siblings = (siblingsRaw ?? [])
    .filter((s) => s.id !== person.id)
    .map((s) => ({
      ...s,
      isHalf: !(person.father_id && person.mother_id && s.father_id === person.father_id && s.mother_id === person.mother_id),
    }));

  const childrenByMarriage = new Map<string, typeof children>();
  const otherChildren: typeof children = [];
  for (const child of children ?? []) {
    const otherParent = child.father_id === person.id ? child.mother_id : child.father_id;
    if (otherParent && marriages.some((m) => m.spouseId === otherParent)) {
      const list = childrenByMarriage.get(otherParent) ?? [];
      list.push(child);
      childrenByMarriage.set(otherParent, list);
    } else {
      otherChildren.push(child);
    }
  }

  const birthDisplay = formatPartialDate({ year: person.birth_year, month: person.birth_month, day: person.birth_day });
  const deathDisplay = formatPartialDate({ year: person.death_year, month: person.death_month, day: person.death_day });
  const lifespan =
    birthDisplay || deathDisplay
      ? `${birthDisplay ?? "?"} – ${person.living_status === "living" ? "present" : deathDisplay ?? "?"}`
      : null;

  return (
    <div className="space-y-6">
      {personRaw.deleted_at && (
        <Card className="border-red-200 bg-red-50">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-red-800">
              <span className="font-medium">Deleted</span> on {new Date(personRaw.deleted_at).toLocaleDateString()}.
              {personRaw.delete_reason && <> Reason: {personRaw.delete_reason}</>} Hidden from browsing and search —
              only admins can see this page.
            </p>
            <form action={restorePerson}>
              <input type="hidden" name="person_id" value={person.id} />
              <PendingButton
                className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
                pendingChildren="Restoring…"
              >
                Restore
              </PendingButton>
            </form>
          </div>
        </Card>
      )}

      <div className="flex items-start gap-4">
        {person.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={person.photo_url} alt={person.full_name} className="h-24 w-24 rounded-full object-cover" />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-200 text-2xl font-semibold text-slate-500">
            {person.full_name.charAt(0)}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            <PersonName person={person} />
          </h1>
          {person.other_names && <p className="text-sm text-slate-500">Also known as {person.other_names}</p>}
          <div className="mt-1 flex items-center gap-2">
            {person.living_status !== "unknown" && (
              <Badge
                className={
                  person.living_status === "deceased"
                    ? "bg-slate-200 text-slate-700"
                    : "bg-green-100 text-green-800"
                }
              >
                {person.living_status}
              </Badge>
            )}
            {lifespan && <span className="text-sm text-slate-500">{lifespan}</span>}
            {person.current_location && <span className="text-sm text-slate-500">· {person.current_location}</span>}
          </div>
        </div>
      </div>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Family</h2>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="font-medium text-slate-500">Father</div>
            {father ? (
              <Link href={`/people/${father.id}`} className="text-slate-900 hover:underline">
                <PersonName person={father} />
              </Link>
            ) : (
              <span className="italic text-slate-400">Unknown</span>
            )}
          </div>
          <div>
            <div className="font-medium text-slate-500">Mother</div>
            {mother ? (
              <Link href={`/people/${mother.id}`} className="text-slate-900 hover:underline">
                <PersonName person={mother} />
              </Link>
            ) : (
              <span className="italic text-slate-400">Unknown</span>
            )}
          </div>
        </div>

        {siblings.length > 0 && (
          <div className="mt-4">
            <div className="font-medium text-slate-500">Siblings</div>
            <ul className="ml-4 list-disc text-sm text-slate-700">
              {siblings.map((s) => (
                <li key={s.id}>
                  <Link href={`/people/${s.id}`} className="hover:underline">
                    <PersonName person={s} />
                  </Link>
                  {s.isHalf && <span className="text-xs text-slate-400"> (half-sibling)</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {marriages.length > 0 && (
          <div className="mt-4 space-y-3">
            {marriages.map((m, i) => (
              <div key={m.spouseId ?? i}>
                <div className="font-medium text-slate-500">
                  Spouse:{" "}
                  {m.spouse ? (
                    <Link href={`/people/${m.spouse.id}`} className="text-slate-900 hover:underline">
                      <PersonName person={m.spouse} />
                    </Link>
                  ) : (
                    "Unknown"
                  )}
                </div>
                {m.marriage_notes && <p className="text-xs text-slate-500">{m.marriage_notes}</p>}
                {(childrenByMarriage.get(m.spouseId ?? "") ?? []).length > 0 && (
                  <ul className="mt-1 ml-4 list-disc text-slate-700">
                    {childrenByMarriage.get(m.spouseId ?? "")!.map((c) => (
                      <li key={c.id}>
                        <Link href={`/people/${c.id}`} className="hover:underline">
                          <PersonName person={c} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {otherChildren.length > 0 && (
          <div className="mt-4">
            <div className="font-medium text-slate-500">Children</div>
            <ul className="ml-4 list-disc text-sm text-slate-700">
              {otherChildren.map((c) => (
                <li key={c.id}>
                  <Link href={`/people/${c.id}`} className="hover:underline">
                    <PersonName person={c} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">About</h2>
        {(person.place_of_birth || person.place_of_death || person.facebook_url || person.linkedin_url) && (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {person.place_of_birth && (
              <div><dt className="font-medium text-slate-500">Place of birth</dt><dd>{person.place_of_birth}</dd></div>
            )}
            {person.place_of_death && (
              <div><dt className="font-medium text-slate-500">Place of death</dt><dd>{person.place_of_death}</dd></div>
            )}
            {person.facebook_url && (
              <div><dt className="font-medium text-slate-500">Facebook</dt><dd><a className="text-slate-900 hover:underline" href={person.facebook_url} target="_blank" rel="noreferrer">{person.facebook_url}</a></dd></div>
            )}
            {person.linkedin_url && (
              <div><dt className="font-medium text-slate-500">LinkedIn</dt><dd><a className="text-slate-900 hover:underline" href={person.linkedin_url} target="_blank" rel="noreferrer">{person.linkedin_url}</a></dd></div>
            )}
          </dl>
        )}
        {person.bio && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{person.bio}</p>}

        <div className="mt-4 flex gap-2 rounded-md bg-blue-50 px-3 py-2.5 text-xs text-blue-900">
          <span>🔒</span>
          <p>
            <span className="font-medium">Privacy &amp; security:</span> everyone here only sees this person&apos;s
            name and current location by default. Everything else — birthday, contact info, social links — is
            encrypted and stays private until they choose to share it, either with everyone in Nams Family App or
            with specific groups they&apos;re in.
          </p>
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Contact Information</h2>
        {contactDetails.length === 0 && (
          <p className="text-sm text-slate-400">
            {isOwner || isAdmin(member)
              ? "No contact details added yet — add one below."
              : "Nothing shared here yet."}
          </p>
        )}
        {(["phone", "email", "address"] as const).map((type) => {
          const entries = contactDetails.filter((c) => c.contact_type === type);
          if (entries.length === 0) return null;
          return (
            <div key={type} className="mb-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {CONTACT_TYPE_LABELS[type]}
              </div>
              <ul className="mt-1 space-y-1 text-sm">
                {entries.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2">
                    <ContactIcons contactType={entry.contact_type} value={entry.value} />
                    <span className="text-slate-800">
                      {entry.label && <span className="text-slate-400">{entry.label}: </span>}
                      {entry.contact_type === "phone" ? formatPhoneForDisplay(entry.value) : entry.value}
                    </span>
                    {(isOwner || isAdmin(member)) && (
                      <form action={deleteContactDetail}>
                        <input type="hidden" name="person_id" value={person.id} />
                        <input type="hidden" name="contact_id" value={entry.id} />
                        <PendingButton className="text-xs text-red-600 hover:underline" pendingChildren="…">
                          remove
                        </PendingButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {(isOwner || isAdmin(member)) && (
          <ContactDetailForm personId={person.id} groups={selectableGroups} />
        )}
      </Card>

      <details className="group rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900">
          Suggest an edit
        </summary>
        <form action={submitPersonEdit} className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2">
          <input type="hidden" name="person_id" value={person.id} />
          <Field label="Full name"><Input name="full_name" defaultValue={personRaw.full_name} /></Field>
          <Field label="Preferred name"><Input name="preferred_name" defaultValue={personRaw.preferred_name ?? ""} /></Field>
          <Field label="Surname tag"><Input name="surname_tag" defaultValue={personRaw.surname_tag ?? ""} /></Field>
          <Field label="Other names"><Input name="other_names" defaultValue={personRaw.other_names ?? ""} /></Field>
          <Field label="Living status">
            <Select name="living_status" defaultValue={personRaw.living_status}>
              <option value="unknown">Unknown</option>
              <option value="living">Living</option>
              <option value="deceased">Deceased</option>
            </Select>
          </Field>
          <Field label="Current location (city, country)"><Input name="current_location" defaultValue={personRaw.current_location ?? ""} /></Field>

          <div className="sm:col-span-2">
            <Field label="Date of birth (any part can be left blank)">
              <div className="flex gap-2">
                <Input name="birth_year" type="number" placeholder="Year" defaultValue={personRaw.birth_year ?? ""} />
                <Select name="birth_month" defaultValue={personRaw.birth_month ?? ""}>
                  <option value="">Month</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString("en", { month: "long" })}</option>
                  ))}
                </Select>
                <Input name="birth_day" type="number" placeholder="Day" defaultValue={personRaw.birth_day ?? ""} />
              </div>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Date of death (any part can be left blank)">
              <div className="flex gap-2">
                <Input name="death_year" type="number" placeholder="Year" defaultValue={personRaw.death_year ?? ""} />
                <Select name="death_month" defaultValue={personRaw.death_month ?? ""}>
                  <option value="">Month</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString("en", { month: "long" })}</option>
                  ))}
                </Select>
                <Input name="death_day" type="number" placeholder="Day" defaultValue={personRaw.death_day ?? ""} />
              </div>
            </Field>
          </div>

          <Field label="Place of birth"><Input name="place_of_birth" defaultValue={personRaw.place_of_birth ?? ""} /></Field>
          <Field label="Place of death"><Input name="place_of_death" defaultValue={personRaw.place_of_death ?? ""} /></Field>
          <Field label="Photo URL"><Input name="photo_url" defaultValue={personRaw.photo_url ?? ""} /></Field>
          <Field label="Facebook URL"><Input name="facebook_url" defaultValue={personRaw.facebook_url ?? ""} /></Field>
          <Field label="LinkedIn URL"><Input name="linkedin_url" defaultValue={personRaw.linkedin_url ?? ""} /></Field>
          <div className="sm:col-span-2"><Field label="Bio / notes"><Textarea name="bio" rows={3} defaultValue={personRaw.bio ?? ""} /></Field></div>
          <div className="sm:col-span-2"><Field label="Note to admin (optional)"><Input name="note" placeholder="e.g. source for this info" /></Field></div>
          <div className="sm:col-span-2"><Button type="submit">Submit for review</Button></div>
        </form>
      </details>

      <details className="group rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900">
          Add a family member
        </summary>
        <div className="space-y-4 border-t border-slate-100 p-4">
          <form action={submitAddPerson} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="relation_to_person_id" value={person.id} />
            <input type="hidden" name="relation_type" value="child" />
            <p className="text-sm font-medium text-slate-700 sm:col-span-2">Add a child of <PersonName person={person} /></p>
            <Field label="Child's full name"><Input name="full_name" required /></Field>
            <Field label="Surname tag"><Input name="surname_tag" /></Field>
            <Field label={`Is ${person.full_name} the father or mother?`}>
              <Select name="parent_gender" defaultValue="father">
                <option value="father">Father</option>
                <option value="mother">Mother</option>
              </Select>
            </Field>
            <Field label="Other parent (optional)">
              <Select name="other_parent_id" defaultValue="">
                <option value="">— Unknown —</option>
                {marriages.map((m) => m.spouse && (
                  <option key={m.spouse.id} value={m.spouse.id}>{displayNameText(m.spouse)}</option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2"><Field label="Note to admin (optional)"><Input name="note" /></Field></div>
            <div className="sm:col-span-2"><Button type="submit">Submit for review</Button></div>
          </form>

          <form action={submitAddPerson} className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <input type="hidden" name="relation_to_person_id" value={person.id} />
            <input type="hidden" name="relation_type" value="spouse" />
            <p className="text-sm font-medium text-slate-700 sm:col-span-2">Add a spouse of <PersonName person={person} /></p>
            <Field label="Spouse's full name"><Input name="full_name" required /></Field>
            <Field label="Surname tag"><Input name="surname_tag" /></Field>
            <div className="sm:col-span-2"><Field label="Marriage notes (optional)"><Input name="marriage_notes" /></Field></div>
            <div className="sm:col-span-2"><Field label="Note to admin (optional)"><Input name="note" /></Field></div>
            <div className="sm:col-span-2"><Button type="submit">Submit for review</Button></div>
          </form>

          {(!person.father_id || !person.mother_id) && (
            <form action={submitAddPerson} className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
              <input type="hidden" name="relation_to_person_id" value={person.id} />
              <input type="hidden" name="relation_type" value="parent" />
              <p className="text-sm font-medium text-slate-700 sm:col-span-2">Add a parent of <PersonName person={person} /></p>
              <Field label="Parent's full name"><Input name="full_name" required /></Field>
              <Field label="Surname tag"><Input name="surname_tag" /></Field>
              <Field label="This person is the">
                <Select name="parent_gender" defaultValue="father">
                  {!person.father_id && <option value="father">Father</option>}
                  {!person.mother_id && <option value="mother">Mother</option>}
                </Select>
              </Field>
              <div className="sm:col-span-2"><Field label="Note to admin (optional)"><Input name="note" /></Field></div>
              <div className="sm:col-span-2"><Button type="submit">Submit for review</Button></div>
            </form>
          )}
        </div>
      </details>

      {canManagePrivacy && (
        <details className="group rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900">
            Privacy settings
          </summary>
          <PrivacySettingsForm
            personId={person.id}
            currentVisibility={currentVisibility}
            currentGroupIds={currentGroupIds}
            groups={selectableGroups}
          />
        </details>
      )}

      <details className="group rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900">History</summary>
        <div className="border-t border-slate-100 p-4 text-sm text-slate-600">
          {!auditEntries?.length && <p className="text-slate-400">No recorded changes yet.</p>}
          <ul className="space-y-1">
            {auditEntries?.map((e) => (
              <li key={e.id}>
                {e.change_type.replace(/_/g, " ")} by {e.members?.name ?? "unknown"} on{" "}
                {new Date(e.created_at).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}
