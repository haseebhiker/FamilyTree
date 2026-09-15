import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import { applyPrivacy, filterAndDecryptContactDetails } from "@/lib/privacy";
import { submitPersonEdit } from "@/lib/actions/pending-changes";
import { AddFamilyMemberForm } from "@/components/add-family-member-form";
import { deleteContactDetail } from "@/lib/actions/contact-details";
import { restorePerson } from "@/lib/actions/people-admin";
import { formatPartialDate } from "@/lib/partial-date";
import { formatPhoneForDisplay } from "@/lib/countries";
import { Card, Field, Input, Select, Textarea, Button, Badge } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { ContactDetailForm } from "@/components/contact-detail-form";
import { ContactIcons } from "@/components/contact-icons";
import { PersonName } from "@/components/person-name";
import { AncestorChart, type AncestorNode } from "@/components/ancestor-chart";
import { RelationshipFinder } from "@/components/relationship-finder";
import { findRelationshipPaths } from "@/lib/relationship";
import type { ContactDetail, Person } from "@/lib/types";

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

  // "How you're related" — only meaningful once the viewer's own account is
  // linked to a person, and not on your own page. Loads the full tree as a
  // plain graph (paginated past Supabase's 1000-row cap, same as the home
  // page's tree) since it needs to search the whole thing, not just this
  // profile's neighborhood.
  let relationshipFinder: {
    paths: ReturnType<typeof findRelationshipPaths>["paths"];
    genders: ReturnType<typeof findRelationshipPaths>["genders"];
    peopleById: Map<string, { id: string; full_name: string; preferred_name: string | null; surname_tag: string | null }>;
  } | null = null;
  if (member?.person_id && member.person_id !== person.id) {
    const graphPeople: { id: string; father_id: string | null; mother_id: string | null; gender: "M" | "F" | null }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page } = await supabase
        .from("people")
        .select("id, father_id, mother_id, gender")
        .is("deleted_at", null)
        .range(from, from + 999);
      if (!page || page.length === 0) break;
      graphPeople.push(...page);
      if (page.length < 1000) break;
    }
    const graphSpouses: { person_a_id: string; person_b_id: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page } = await supabase.from("spouses").select("person_a_id, person_b_id").range(from, from + 999);
      if (!page || page.length === 0) break;
      graphSpouses.push(...page);
      if (page.length < 1000) break;
    }

    const { paths, genders } = findRelationshipPaths(graphPeople, graphSpouses, member.person_id, person.id, 5);
    if (paths.length > 0) {
      const involvedIds = [...new Set(paths.flat().map((s) => s.id))];
      const { data: involvedPeople } = await supabase
        .from("people")
        .select("id, full_name, preferred_name, surname_tag")
        .in("id", involvedIds);
      const peopleById = new Map((involvedPeople ?? []).map((p) => [p.id, p]));
      relationshipFinder = { paths, genders, peopleById };
    }
  }

  const [
    { data: father },
    { data: mother },
    { data: spousesAsA },
    { data: spousesAsB },
    { data: auditEntries },
    { data: contactDetailsRaw },
    { data: allGroups },
  ] = await Promise.all([
    person.father_id
      ? supabase
          .from("people")
          .select("id, full_name, preferred_name, surname_tag, father_id, mother_id")
          .eq("id", person.father_id)
          .single()
      : Promise.resolve({ data: null }),
    person.mother_id
      ? supabase
          .from("people")
          .select("id, full_name, preferred_name, surname_tag, father_id, mother_id")
          .eq("id", person.mother_id)
          .single()
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
    supabase.from("groups").select("id, name").order("name"),
  ]);

  const contactDetails = await filterAndDecryptContactDetails(
    supabase,
    (contactDetailsRaw ?? []) as ContactDetail[],
    person,
    member,
  );

  // Which groups this profile can pick from when sharing its info — the
  // branches this person is actually tagged into (sharing with a branch
  // you're not part of wouldn't make sense).
  const { data: personGroupRows } = await supabase.from("group_people").select("group_id").eq("person_id", person.id);
  const personGroupIds = new Set((personGroupRows ?? []).map((g) => g.group_id));
  const selectableGroups = (allGroups ?? []).filter((g) => personGroupIds.has(g.id));

  const marriages = [
    ...(spousesAsA ?? []).map((s) => ({ spouse: s.person_b, marriage_notes: s.marriage_notes, spouseId: s.person_b_id })),
    ...(spousesAsB ?? []).map((s) => ({ spouse: s.person_a, marriage_notes: s.marriage_notes, spouseId: s.person_a_id })),
  ];

  const grandparentIds = [father?.father_id, father?.mother_id, mother?.father_id, mother?.mother_id].filter(
    (id): id is string => !!id,
  );
  const { data: grandparentsRaw } =
    grandparentIds.length > 0
      ? await supabase.from("people").select("id, full_name, preferred_name, surname_tag").in("id", grandparentIds)
      : { data: [] as { id: string; full_name: string; preferred_name: string | null; surname_tag: string | null }[] };
  const grandparentsById = new Map((grandparentsRaw ?? []).map((p) => [p.id, p]));

  const ancestorChart: AncestorNode = {
    id: person.id,
    full_name: person.full_name,
    preferred_name: person.preferred_name,
    surname_tag: person.surname_tag,
    father: father
      ? {
          ...father,
          father: father.father_id ? (grandparentsById.get(father.father_id) as AncestorNode) ?? null : null,
          mother: father.mother_id ? (grandparentsById.get(father.mother_id) as AncestorNode) ?? null : null,
        }
      : null,
    mother: mother
      ? {
          ...mother,
          father: mother.father_id ? (grandparentsById.get(mother.father_id) as AncestorNode) ?? null : null,
          mother: mother.mother_id ? (grandparentsById.get(mother.mother_id) as AncestorNode) ?? null : null,
        }
      : null,
  };

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

  const { data: allPeopleForPicker } = await supabase
    .from("people")
    .select("id, full_name, preferred_name, surname_tag")
    .is("deleted_at", null)
    .neq("id", person.id)
    .order("full_name")
    .limit(2000);

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
          <Link href={`/compare?a=${person.id}`} className="text-xs text-slate-400 hover:text-slate-600 hover:underline">
            Compare relationship with someone else…
          </Link>
        </div>
      </div>

      {relationshipFinder && (
        <RelationshipFinder
          paths={relationshipFinder.paths}
          genders={relationshipFinder.genders}
          peopleById={relationshipFinder.peopleById}
        />
      )}

      {ancestorChart.father || ancestorChart.mother ? (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Ancestors</h2>
          <AncestorChart root={ancestorChart} />
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Family</h2>

        {marriages.length > 0 && (
          <div>
            <div className="font-medium text-slate-500">Spouse{marriages.length > 1 ? "s" : ""}</div>
            <ul className="ml-4 list-disc text-sm text-slate-700">
              {marriages.map((m, i) => (
                <li key={m.spouseId ?? i}>
                  {m.spouse ? (
                    <Link href={`/people/${m.spouse.id}`} className="hover:underline">
                      <PersonName person={m.spouse} />
                    </Link>
                  ) : (
                    "Unknown"
                  )}
                  {m.marriage_notes && <span className="text-xs text-slate-400"> — {m.marriage_notes}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={`grid gap-3 text-sm sm:grid-cols-2 ${marriages.length > 0 ? "mt-5" : ""}`}>
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

        {(children ?? []).length > 0 && (
          <div className="mt-5">
            <div className="font-medium text-slate-500">Children</div>
            <ul className="ml-4 list-disc text-sm text-slate-700">
              {(children ?? []).map((c) => (
                <li key={c.id}>
                  <Link href={`/people/${c.id}`} className="hover:underline">
                    <PersonName person={c} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {siblings.length > 0 && (
          <div className="mt-5">
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
      </Card>

      {(person.place_of_birth || person.place_of_death || person.facebook_url || person.linkedin_url || person.bio) && (
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
        </Card>
      )}

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
          <Field label="Gender">
            <Select name="gender" defaultValue={personRaw.gender ?? ""}>
              <option value="">Unknown</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </Select>
          </Field>
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
        <div className="border-t border-slate-100 p-4">
          <AddFamilyMemberForm
            personId={person.id}
            hasFather={!!person.father_id}
            hasMother={!!person.mother_id}
            people={allPeopleForPicker ?? []}
          />
        </div>
      </details>

      {isOwner ? (
        <p className="text-xs text-slate-400">
          <Link href="/privacy" className="hover:text-slate-600 hover:underline">
            Manage your privacy settings →
          </Link>
        </p>
      ) : (
        isAdmin(member) && (
          <p className="text-xs text-slate-400">
            <Link href={`/privacy?person=${person.id}`} className="hover:text-slate-600 hover:underline">
              Manage privacy for this person →
            </Link>
          </p>
        )
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
