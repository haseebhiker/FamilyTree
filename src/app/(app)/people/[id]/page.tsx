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
import { linkInviteToPerson, unlinkPersonAccount, updateLinkedAccount } from "@/lib/actions/invites";
import { sortByAge, sortSiblings } from "@/lib/sort-by-age";
import { formatPhoneForDisplay } from "@/lib/countries";
import { Card, Badge, ChevronIcon, Select, Input, Field, Textarea } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { ContactDetailForm } from "@/components/contact-detail-form";
import { ProfileActionButtons } from "@/components/profile-action-buttons";
import { PersonAvatar } from "@/components/person-avatar";
import { ContactIcons } from "@/components/contact-icons";
import { PersonName, ResponsivePersonName } from "@/components/person-name";
import { AncestorChart, type AncestorNode } from "@/components/ancestor-chart";
import { RelationshipFinder } from "@/components/relationship-finder";
import { findRelationshipPaths } from "@/lib/relationship";
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

  // Year-only by default at the top of the page — the full date (with
  // month/day, when known) still shows in the "Suggest an edit" form and
  // wherever else it's already displayed; this is just the at-a-glance
  // header line, which reads better short.
  const birthYearDisplay = person.birth_year ? String(person.birth_year) : null;
  const deathYearDisplay = person.death_year ? String(person.death_year) : null;
  const lifespan =
    birthYearDisplay || deathYearDisplay
      ? `${birthYearDisplay ?? "?"} – ${person.living_status === "living" ? "present" : deathYearDisplay ?? "?"}`
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
        <PersonAvatar photoUrl={person.photo_url} fullName={person.full_name} />
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
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
                    <form action={removeSpouseLink} className="inline">
                      <input type="hidden" name="person_id" value={person.id} />
                      <input type="hidden" name="spouse_row_id" value={m.spouseRowId} />
                      <PendingButton
                        className="ml-2 text-xs text-red-600 hover:underline"
                        pendingChildren="…"
                        confirmMessage={`Remove ${m.spouse ? m.spouse.full_name : "this spouse"} as a spouse of ${person.full_name}?`}
                      >
                        remove
                      </PendingButton>
                    </form>
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
                  <form action={removeParentLink} className="inline">
                    <input type="hidden" name="person_id" value={person.id} />
                    <input type="hidden" name="which" value="father" />
                    <PendingButton
                      className="ml-2 text-xs text-red-600 hover:underline"
                      pendingChildren="…"
                      confirmMessage={`Remove ${father.full_name} as ${person.full_name}'s father?`}
                    >
                      remove
                    </PendingButton>
                  </form>
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
                  <form action={removeParentLink} className="inline">
                    <input type="hidden" name="person_id" value={person.id} />
                    <input type="hidden" name="which" value="mother" />
                    <PendingButton
                      className="ml-2 text-xs text-red-600 hover:underline"
                      pendingChildren="…"
                      confirmMessage={`Remove ${mother.full_name} as ${person.full_name}'s mother?`}
                    >
                      remove
                    </PendingButton>
                  </form>
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
        </Card>
      ) : !(isOwner || isAdmin(member)) ? (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Contact Information</h2>
          <p className="text-sm text-slate-400">Nothing shared here yet.</p>
        </Card>
      ) : null}

      {isSuperAdmin(member) && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-slate-900">
            Linked account{linkedAccounts.length !== 1 ? "s" : ""} (admin only)
          </h2>
          {linkedAccounts.length > 1 && (
            <p className="mb-3 text-xs text-amber-700">
              {linkedAccounts.length} accounts point here — normal right after someone accepts an invite (their
              invite row and their new member row both still link here), but worth tidying up if it&apos;s stale.
            </p>
          )}
          {linkedAccounts.length > 0 ? (
            <div className="space-y-4">
              {linkedAccounts.map((acc) => (
                <div key={`${acc.source}:${acc.id}`} className="space-y-3 rounded-md border border-slate-200 p-3">
                  <form action={updateLinkedAccount} className="grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="source" value={acc.source} />
                    <input type="hidden" name="record_id" value={acc.id} />
                    <input type="hidden" name="person_id" value={person.id} />
                    {acc.accessRequest && <input type="hidden" name="access_request_id" value={acc.accessRequest.id} />}
                    <Field label="Name">
                      <Input name="name" defaultValue={acc.name} />
                    </Field>
                    <Field label="Gmail">
                      <Input name="email" type="email" defaultValue={acc.email} />
                    </Field>
                    <Field label="Role">
                      <Select name="role" defaultValue={acc.role}>
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                        <option value="super_admin">Super admin</option>
                      </Select>
                    </Field>
                    <div className="flex items-end text-sm text-slate-500">
                      <span>
                        <span className="font-medium text-slate-500">Status:</span> {acc.status}
                        {acc.source === "invite" && (
                          <span className="text-slate-400"> — invite record{acc.status === "accepted" ? ", already accepted" : ", hasn't signed in yet"}</span>
                        )}
                      </span>
                    </div>
                    {acc.accessRequest ? (
                      <>
                        <div className="sm:col-span-2">
                          <Field label="How they said they're related">
                            <Textarea name="relation_description" rows={2} defaultValue={acc.accessRequest.relation_description} />
                          </Field>
                        </div>
                        <div className="sm:col-span-2">
                          <Field label="Notes (optional)">
                            <Textarea name="notes" rows={2} defaultValue={acc.accessRequest.notes ?? ""} />
                          </Field>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-slate-400 sm:col-span-2">
                        Invited directly — no access request on file to show a stated reason for.
                      </p>
                    )}
                    <div className="sm:col-span-2">
                      <PendingButton
                        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                        pendingChildren="Saving…"
                      >
                        Save
                      </PendingButton>
                    </div>
                  </form>
                  <form action={unlinkPersonAccount}>
                    <input type="hidden" name="source" value={acc.source} />
                    <input type="hidden" name="record_id" value={acc.id} />
                    <input type="hidden" name="person_id" value={person.id} />
                    <PendingButton
                      className="text-xs text-red-600 hover:underline"
                      pendingChildren="…"
                      confirmMessage={`Unlink ${person.full_name}'s profile from this ${acc.source} record (${acc.email})?`}
                    >
                      Unlink this account
                    </PendingButton>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-slate-400">Not linked to any invited account.</p>
              {unlinkedInvites.length > 0 && (
                <form action={linkInviteToPerson} className="flex items-center gap-2">
                  <input type="hidden" name="person_id" value={person.id} />
                  <Select name="invite_id" className="w-auto text-xs" required defaultValue="">
                    <option value="" disabled>
                      Link to…
                    </option>
                    {unlinkedInvites.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.name} ({inv.email})
                      </option>
                    ))}
                  </Select>
                  <PendingButton
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    pendingChildren="…"
                  >
                    Link
                  </PendingButton>
                </form>
              )}
            </div>
          )}
        </Card>
      )}

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
