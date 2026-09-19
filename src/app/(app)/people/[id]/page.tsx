import { notFound } from "next/navigation";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin, isSuperAdmin } from "@/lib/members";
import { applyPrivacy, filterAndDecryptContactDetails } from "@/lib/privacy";
import { AddFamilyMemberForm } from "@/components/add-family-member-form";
import { EditPersonForm } from "@/components/edit-person-form";
import { deleteContactDetail } from "@/lib/actions/contact-details";
import { restorePerson, removeParentLink, removeSpouseLink } from "@/lib/actions/people-admin";
import { linkInviteToPersonDirect, unlinkPersonAccount, updateLinkedAccount } from "@/lib/actions/invites";
import { sortByAge, sortSiblings } from "@/lib/sort-by-age";
import { formatPhoneForDisplay } from "@/lib/countries";
import { Card, Badge, ChevronIcon } from "@/components/ui";
import { ActionButton } from "@/components/action-button";
import { LinkedAccountForm } from "@/components/linked-account-form";
import { LinkInviteForm } from "@/components/link-invite-form";
import { ContactDetailForm } from "@/components/contact-detail-form";
import { ProfileActionButtons } from "@/components/profile-action-buttons";
import { PersonAvatar } from "@/components/person-avatar";
import { PersonAvatarUpload } from "@/components/person-photo-upload";
import { ShareButton } from "@/components/share-button";
import { ContactIcons } from "@/components/contact-icons";
import { ProfileHeaderName, ResponsivePersonName } from "@/components/person-name";
import { AncestorChart, type AncestorNode } from "@/components/ancestor-chart";
import { RelationshipFinder } from "@/components/relationship-finder";
import { findRelationshipPaths } from "@/lib/relationship";
import { describeChange } from "@/lib/describe-change";
import type { ContactDetail, Person } from "@/lib/types";

const CONTACT_TYPE_LABELS: Record<string, string> = {
  phone: "Phone",
  email: "Email",
  address: "Address",
};

interface CousinLite {
  id: string;
  full_name: string;
  preferred_name: string | null;
  surname_tag: string | null;
  birth_year: number | null;
  birth_month: number | null;
  birth_day: number | null;
}

/**
 * First cousins on one side: children of `parent`'s own siblings (i.e. this
 * person's aunts/uncles on that side) — mirrors how the Siblings section
 * above finds siblings, just one generation up first. Half-aunts/uncles
 * (sharing only one of `parent`'s own parents) are included, same as the
 * Siblings section includes half-siblings.
 */
async function fetchCousins(
  supabase: SupabaseClient,
  parent: { id: string; father_id: string | null; mother_id: string | null } | null,
): Promise<CousinLite[]> {
  if (!parent) return [];
  const auntUncleConditions = [
    parent.father_id ? `father_id.eq.${parent.father_id}` : null,
    parent.mother_id ? `mother_id.eq.${parent.mother_id}` : null,
  ].filter((c): c is string => c !== null);
  if (auntUncleConditions.length === 0) return [];

  const { data: auntsUnclesRaw } = await supabase.from("people").select("id").or(auntUncleConditions.join(","));
  const auntUncleIds = (auntsUnclesRaw ?? []).map((a) => a.id).filter((aid) => aid !== parent.id);
  if (auntUncleIds.length === 0) return [];

  const cousinConditions = auntUncleIds.flatMap((aid) => [`father_id.eq.${aid}`, `mother_id.eq.${aid}`]);
  const { data: cousinsRaw } = await supabase
    .from("people")
    .select("id, full_name, preferred_name, surname_tag, birth_year, birth_month, birth_day, birth_order")
    .or(cousinConditions.join(","))
    .order("full_name");
  return cousinsRaw ?? [];
}

interface NameLike {
  full_name: string;
  preferred_name: string | null;
  surname_tag: string | null;
}

/** Name for a Children/Siblings/Cousins row, with their spouse (if any) shown in parentheses — preferred-name-only on mobile, full name on desktop, for both. */
function ListedPersonName({ person, spouse }: { person: NameLike; spouse?: NameLike }) {
  return (
    <>
      <ResponsivePersonName person={person} />
      {spouse && (
        <span className="text-slate-500">
          {" "}
          (<ResponsivePersonName person={spouse} />)
        </span>
      )}
    </>
  );
}

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
  // Just this person — enough for describeChange's nameOf() to resolve the
  // usual case (an edit_person or propose_deletion entry about them), not a
  // full lookup of every person any History entry might reference.
  const historyPeopleById = new Map([[person.id, person]]);

  // "How you're related" — only meaningful once the viewer's own account is
  // linked to a person, and not on your own page. Loads the full tree as a
  // plain graph (paginated past Supabase's 1000-row cap, same as the home
  // page's tree) since it needs to search the whole thing, not just this
  // profile's neighborhood.
  let relationshipFinder: {
    paths: ReturnType<typeof findRelationshipPaths>["paths"];
    genders: ReturnType<typeof findRelationshipPaths>["genders"];
    birthYears: Map<string, number | null>;
    birthOrders: Map<string, number | null>;
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
      // member.person_id (the viewer) is included too — Tamil sibling/aunt/
      // uncle terms need the viewer's own birth_year to compare ages, and
      // the viewer isn't otherwise a step in their own relationship path.
      const involvedIds = [...new Set([...paths.flat().map((s) => s.id), member.person_id])];
      const { data: involvedPeople } = await supabase
        .from("people")
        .select("id, full_name, preferred_name, surname_tag, birth_year, birth_order")
        .in("id", involvedIds);
      const peopleById = new Map((involvedPeople ?? []).map((p) => [p.id, p]));
      const birthYears = new Map((involvedPeople ?? []).map((p) => [p.id, p.birth_year]));
      const birthOrders = new Map((involvedPeople ?? []).map((p) => [p.id, p.birth_order]));
      relationshipFinder = { paths, genders, birthYears, birthOrders, peopleById };
    }
  }

  const [
    { data: father },
    { data: mother },
    { data: spousesAsA },
    { data: spousesAsB },
    { data: auditEntries },
    { data: contactDetailsRaw },
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
      .select("*, submitter:members!audit_log_submitted_by_fkey(name)")
      .eq("person_id", person.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("contact_details").select("*").eq("person_id", person.id).order("created_at"),
  ]);

  const contactDetails = await filterAndDecryptContactDetails(
    supabase,
    (contactDetailsRaw ?? []) as ContactDetail[],
    person,
    member,
  );

  const marriages = [
    ...(spousesAsA ?? []).map((s) => ({ spouse: s.person_b, marriage_notes: s.marriage_notes, spouseId: s.person_b_id, spouseRowId: s.id })),
    ...(spousesAsB ?? []).map((s) => ({ spouse: s.person_a, marriage_notes: s.marriage_notes, spouseId: s.person_a_id, spouseRowId: s.id })),
  ];

  // Admin-only, and only queried at all for a super admin (the only role
  // that can actually act on it) — everyone else viewing a profile
  // shouldn't pay for these extra round-trips. Shows every invited
  // account linked to this profile — normally exactly one, but an
  // accepted invite legitimately leaves BOTH its own (now-historical)
  // invites row and the resulting members row pointing here, so this has
  // to be a list, not a single match, or one of the two silently goes
  // unmanaged. For each, when it came through the self-service "Request
  // access" flow, also shows what they said about how they're related,
  // which otherwise lives only on the now-decided access_requests row and
  // is easy to lose track of.
  interface LinkedAccount {
    source: "member" | "invite";
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    accessRequest: { id: string; relation_description: string; notes: string | null } | null;
  }
  let linkedAccounts: LinkedAccount[] = [];
  let unlinkedInvites: { id: string; name: string; email: string }[] = [];

  if (isSuperAdmin(member)) {
    const [{ data: memberMatches }, { data: inviteMatches }, { data: openInvites }] = await Promise.all([
      supabase.from("members").select("id, name, email, role, status").eq("person_id", person.id),
      supabase.from("invites").select("id, name, email, role, status").eq("person_id", person.id).order("created_at", { ascending: false }),
      supabase.from("invites").select("id, name, email").is("person_id", null).neq("status", "revoked").order("name").limit(500),
    ]);

    const combined = [
      ...(memberMatches ?? []).map((m) => ({ source: "member" as const, ...m })),
      ...(inviteMatches ?? []).map((i) => ({ source: "invite" as const, ...i })),
    ];

    linkedAccounts = await Promise.all(
      combined.map(async (acc) => {
        const { data: reqMatch } = await supabase
          .from("access_requests")
          .select("id, relation_description, notes")
          .ilike("email", acc.email)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return { ...acc, accessRequest: reqMatch ?? null };
      }),
    );

    unlinkedInvites = openInvites ?? [];
  }

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

  const { data: childrenRaw } = await supabase
    .from("people")
    .select("id, full_name, preferred_name, surname_tag, father_id, mother_id, birth_year, birth_month, birth_day, birth_order")
    .or(`father_id.eq.${person.id},mother_id.eq.${person.id}`)
    .order("full_name");
  const children = sortSiblings(childrenRaw ?? []);

  const siblingConditions = [
    person.father_id ? `father_id.eq.${person.father_id}` : null,
    person.mother_id ? `mother_id.eq.${person.mother_id}` : null,
  ].filter((c): c is string => c !== null);
  const { data: siblingsRaw } =
    siblingConditions.length > 0
      ? await supabase
          .from("people")
          .select("id, full_name, preferred_name, surname_tag, father_id, mother_id, birth_year, birth_month, birth_day, birth_order")
          .or(siblingConditions.join(","))
          .order("full_name")
      : { data: [] };
  const siblings = sortSiblings(
    (siblingsRaw ?? [])
      .filter((s) => s.id !== person.id)
      .map((s) => ({
        ...s,
        isHalf: !(person.father_id && person.mother_id && s.father_id === person.father_id && s.mother_id === person.mother_id),
      })),
  );

  const [paternalCousinsRaw, maternalCousinsRaw] = await Promise.all([
    fetchCousins(supabase, father),
    fetchCousins(supabase, mother),
  ]);
  const paternalCousins = sortByAge(paternalCousinsRaw.filter((c) => c.id !== person.id));
  const maternalCousins = sortByAge(maternalCousinsRaw.filter((c) => c.id !== person.id));
  const allCousinIds = new Set([...paternalCousins.map((c) => c.id), ...maternalCousins.map((c) => c.id)]);

  // Spouse-in-parentheses on the Children/Siblings/Cousins lists — a
  // single query covering every person listed anywhere in those three,
  // rather than one round-trip per row.
  const listedPersonIds = [
    ...children.map((c) => c.id),
    ...siblings.map((s) => s.id),
    ...paternalCousins.map((c) => c.id),
    ...maternalCousins.map((c) => c.id),
  ];
  const spouseByPersonId = new Map<string, { id: string; full_name: string; preferred_name: string | null; surname_tag: string | null }>();
  if (listedPersonIds.length > 0) {
    const [{ data: spousesAsAList }, { data: spousesAsBList }] = await Promise.all([
      supabase
        .from("spouses")
        .select("person_a_id, spouse:people!spouses_person_b_id_fkey(id, full_name, preferred_name, surname_tag)")
        .in("person_a_id", listedPersonIds),
      supabase
        .from("spouses")
        .select("person_b_id, spouse:people!spouses_person_a_id_fkey(id, full_name, preferred_name, surname_tag)")
        .in("person_b_id", listedPersonIds),
    ]);
    // Supabase's inferred type for this embed is an array regardless of the
    // FK's actual (many-to-one) cardinality — it's always exactly one row
    // or null at runtime, same as the identical join used for `marriages`
    // above, so this just normalizes the type rather than the data.
    for (const row of spousesAsAList ?? []) {
      const spouse = Array.isArray(row.spouse) ? row.spouse[0] : row.spouse;
      if (spouse) spouseByPersonId.set(row.person_a_id, spouse);
    }
    for (const row of spousesAsBList ?? []) {
      const spouse = Array.isArray(row.spouse) ? row.spouse[0] : row.spouse;
      if (spouse) spouseByPersonId.set(row.person_b_id, spouse);
    }
  }

  const { data: allPeopleForPicker } = await supabase
    .from("people")
    .select("id, full_name, preferred_name, surname_tag")
    .is("deleted_at", null)
    .neq("id", person.id)
    .order("full_name")
    .limit(2000);

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
            <ActionButton
              action={restorePerson}
              fields={{ person_id: person.id }}
              className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
              pendingChildren="Restoring…"
            >
              Restore
            </ActionButton>
          </div>
        </Card>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {isOwner || isAdmin(member) ? (
            <PersonAvatarUpload
              personId={person.id}
              photoUrl={person.photo_url}
              thumbnailUrl={person.photo_thumbnail_url}
              fullName={person.full_name}
              previousPhotoUrl={person.photo_url}
              previousThumbnailUrl={person.photo_thumbnail_url}
            />
          ) : (
            <PersonAvatar photoUrl={person.photo_url} thumbnailUrl={person.photo_thumbnail_url} fullName={person.full_name} />
          )}
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              <ProfileHeaderName person={person} />
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
              {person.current_location && <span className="text-sm text-slate-500">{person.current_location}</span>}
            </div>
            <Link href={`/compare?a=${person.id}`} className="text-xs text-slate-400 hover:text-slate-600 hover:underline">
              Compare relationship with someone else…
            </Link>
            <p className="mt-0.5 text-[10px] text-slate-300 select-all">ID: {person.id}</p>
          </div>
        </div>
        <ShareButton
          title={`${person.preferred_name?.trim() || person.full_name} — Nams Family Tree`}
          url={`https://familytree.haseeb.in/people/${person.id}`}
        />
      </div>

      {relationshipFinder && (
        <RelationshipFinder
          paths={relationshipFinder.paths}
          genders={relationshipFinder.genders}
          birthYears={relationshipFinder.birthYears}
          birthOrders={relationshipFinder.birthOrders}
          sourceId={member!.person_id!}
          peopleById={relationshipFinder.peopleById}
        />
      )}

      <ProfileActionButtons
        showAddContact={isOwner || isAdmin(member)}
        contactForm={
          <div className="p-4">
            <ContactDetailForm personId={person.id} />
          </div>
        }
        editForm={<EditPersonForm personId={person.id} personRaw={personRaw as Person} />}
        addFamilyMemberForm={
          <div className="p-4">
            <AddFamilyMemberForm
              personId={person.id}
              hasFather={!!person.father_id}
              hasMother={!!person.mother_id}
              people={allPeopleForPicker ?? []}
              existingChildren={children}
              existingSiblings={siblings}
              existingSpouses={marriages.map((m) => m.spouse).filter((s): s is NonNullable<typeof s> => !!s)}
            />
          </div>
        }
      />

      {/* Family (spouse / children / parents / siblings) comes before the
          Ancestors chart: it's the immediate household, which is what people
          look for first — the pedigree chart is the deeper dive. */}
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
                      <ResponsivePersonName person={m.spouse} />
                    </Link>
                  ) : (
                    "Unknown"
                  )}
                  {isAdmin(member) && (
                    <ActionButton
                      inline
                      action={removeSpouseLink}
                      fields={{ person_id: person.id, spouse_row_id: m.spouseRowId }}
                      className="ml-2 text-xs text-red-600 hover:underline"
                      pendingChildren="…"
                      confirmMessage={`Remove ${m.spouse ? m.spouse.full_name : "this spouse"} as a spouse of ${person.full_name}?`}
                    >
                      remove
                    </ActionButton>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(children ?? []).length > 0 && (
          <div className={marriages.length > 0 ? "mt-5" : ""}>
            <div className="font-medium text-slate-500">Children ({(children ?? []).length})</div>
            <ul className="ml-4 list-disc text-sm text-slate-700">
              {(children ?? []).map((c) => (
                <li key={c.id}>
                  <Link href={`/people/${c.id}`} className="hover:underline">
                    <ListedPersonName person={c} spouse={spouseByPersonId.get(c.id)} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Hidden entirely when neither parent is known, rather than showing a
            pair of "Unknown" placeholders — that's the normal case for the
            oldest generation in the tree, where it's noise rather than a gap
            worth pointing at. A person with exactly one known parent still
            shows both columns, since there the blank IS meaningful. */}
        {(father || mother) && (
        <div className={`grid gap-3 text-sm sm:grid-cols-2 ${marriages.length > 0 || (children ?? []).length > 0 ? "mt-5" : ""}`}>
          <div>
            <div className="font-medium text-slate-500">Father</div>
            {father ? (
              <div>
                <Link href={`/people/${father.id}`} className="text-slate-900 hover:underline">
                  <ResponsivePersonName person={father} />
                </Link>
                {isAdmin(member) && (
                  <ActionButton
                    inline
                    action={removeParentLink}
                    fields={{ person_id: person.id, which: "father" }}
                    className="ml-2 text-xs text-red-600 hover:underline"
                    pendingChildren="…"
                    confirmMessage={`Remove ${father.full_name} as ${person.full_name}'s father?`}
                  >
                    remove
                  </ActionButton>
                )}
              </div>
            ) : (
              <span className="italic text-slate-400">Unknown</span>
            )}
          </div>
          <div>
            <div className="font-medium text-slate-500">Mother</div>
            {mother ? (
              <div>
                <Link href={`/people/${mother.id}`} className="text-slate-900 hover:underline">
                  <ResponsivePersonName person={mother} />
                </Link>
                {isAdmin(member) && (
                  <ActionButton
                    inline
                    action={removeParentLink}
                    fields={{ person_id: person.id, which: "mother" }}
                    className="ml-2 text-xs text-red-600 hover:underline"
                    pendingChildren="…"
                    confirmMessage={`Remove ${mother.full_name} as ${person.full_name}'s mother?`}
                  >
                    remove
                  </ActionButton>
                )}
              </div>
            ) : (
              <span className="italic text-slate-400">Unknown</span>
            )}
          </div>
        </div>
        )}

        {siblings.length > 0 && (
          <div className="mt-5">
            <div className="font-medium text-slate-500">Siblings ({siblings.length})</div>
            <ul className="ml-4 list-disc text-sm text-slate-700">
              {siblings.map((s) => (
                <li key={s.id}>
                  <Link href={`/people/${s.id}`} className="hover:underline">
                    <ListedPersonName person={s} spouse={spouseByPersonId.get(s.id)} />
                  </Link>
                  {s.isHalf && <span className="text-xs text-slate-400"> (half-sibling)</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {allCousinIds.size > 0 && (
          <details className="mt-5">
            <summary className="cursor-pointer text-sm font-medium text-slate-500 hover:text-slate-700">
              Cousins ({allCousinIds.size})
            </summary>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              {paternalCousins.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-slate-400">Dad&apos;s side ({paternalCousins.length})</div>
                  <ul className="ml-4 list-disc text-sm text-slate-700">
                    {paternalCousins.map((c) => (
                      <li key={c.id}>
                        <Link href={`/people/${c.id}`} className="hover:underline">
                          <ListedPersonName person={c} spouse={spouseByPersonId.get(c.id)} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {maternalCousins.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-slate-400">Mom&apos;s side ({maternalCousins.length})</div>
                  <ul className="ml-4 list-disc text-sm text-slate-700">
                    {maternalCousins.map((c) => (
                      <li key={c.id}>
                        <Link href={`/people/${c.id}`} className="hover:underline">
                          <ListedPersonName person={c} spouse={spouseByPersonId.get(c.id)} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        )}
      </Card>

      {ancestorChart.father || ancestorChart.mother ? (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Ancestors</h2>
          <AncestorChart root={ancestorChart} />
        </Card>
      ) : null}

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

      {contactDetails.length > 0 ? (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Contact Information</h2>
          {(["phone", "email", "address"] as const).map((type) => {
            const entries = contactDetails.filter((c) => c.contact_type === type);
            if (entries.length === 0) return null;
            return (
              <div key={type} className="mb-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {CONTACT_TYPE_LABELS[type]}
                </div>
                <ul className="mt-1 space-y-1 text-xs">
                  {entries.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-2">
                      <ContactIcons contactType={entry.contact_type} value={entry.value} />
                      <span className="text-slate-800">
                        {entry.label && <span className="text-slate-400">{entry.label}: </span>}
                        {entry.contact_type === "phone" ? formatPhoneForDisplay(entry.value) : entry.value}
                      </span>
                      {(isOwner || isAdmin(member)) && (
                        <ActionButton
                          inline
                          action={deleteContactDetail}
                          fields={{ person_id: person.id, contact_id: entry.id }}
                          className="text-xs text-red-600 hover:underline"
                          pendingChildren="…"
                        >
                          remove
                        </ActionButton>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </Card>
      ) : !(isOwner || isAdmin(member)) ? (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Contact Information</h2>
          <p className="text-sm text-slate-400">Nothing shared here yet.</p>
        </Card>
      ) : null}

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
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-900">
          <ChevronIcon className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
          History
        </summary>
        <div className="border-t border-slate-100 p-4 text-sm text-slate-600">
          {!auditEntries?.length && <p className="text-slate-400">No recorded changes yet.</p>}
          <ul className="space-y-2">
            {auditEntries?.map((e) => (
              <li key={e.id}>
                <div>
                  {e.change_type.replace(/_/g, " ")} — requested by {e.submitter?.name ?? "unknown"} on{" "}
                  {new Date(e.created_at).toLocaleDateString()}
                </div>
                <div className="text-xs text-slate-400">
                  {describeChange(e.change_type, e.new_value, e.person_id, e.old_value, historyPeopleById)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </details>

      {isSuperAdmin(member) && (
        <details className="group rounded-lg border border-slate-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-900">
            <ChevronIcon className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
            Linked account{linkedAccounts.length !== 1 ? "s" : ""} (admin only)
          </summary>
          <div className="space-y-3 border-t border-slate-100 p-4">
            {linkedAccounts.length > 1 && (
              <p className="text-xs text-amber-700">
                {linkedAccounts.length} accounts point here — normal right after someone accepts an invite (their
                invite row and their new member row both still link here), but worth tidying up if it&apos;s stale.
              </p>
            )}
            {linkedAccounts.length > 0 ? (
              <div className="space-y-4">
                {linkedAccounts.map((acc) => (
                  <div key={`${acc.source}:${acc.id}`} className="space-y-3 rounded-md border border-slate-200 p-3">
                    <LinkedAccountForm acc={acc} personId={person.id} updateLinkedAccount={updateLinkedAccount} />
                    <ActionButton
                      action={unlinkPersonAccount}
                      fields={{ source: acc.source, record_id: acc.id, person_id: person.id }}
                      className="text-xs text-red-600 hover:underline"
                      pendingChildren="…"
                      confirmMessage={`Unlink ${person.full_name}'s profile from this ${acc.source} record (${acc.email})?`}
                    >
                      Unlink this account
                    </ActionButton>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-slate-400">Not linked to any invited account.</p>
                {unlinkedInvites.length > 0 && (
                  <LinkInviteForm personId={person.id} unlinkedInvites={unlinkedInvites} linkInviteToPerson={linkInviteToPersonDirect} />
                )}
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
