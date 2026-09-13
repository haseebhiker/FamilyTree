import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import { applyPrivacy, filterContactDetails } from "@/lib/privacy";
import { submitPersonEdit, submitAddPerson, submitProposeDeletion } from "@/lib/actions/pending-changes";
import { updateFieldPrivacy } from "@/lib/actions/privacy";
import { addContactDetail, deleteContactDetail } from "@/lib/actions/contact-details";
import { Card, Field, Input, Select, Textarea, Button, Badge } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import type { ContactDetail, Person } from "@/lib/types";
import { PRIVACY_FIELDS } from "@/lib/types";

const CONTACT_TYPE_LABELS: Record<string, string> = {
  phone: "Phone",
  email: "Email",
  address: "Address",
};

function displayName(p: Pick<Person, "full_name" | "surname_tag">) {
  return p.surname_tag ? `${p.full_name} /${p.surname_tag}/` : p.full_name;
}

function lifespan(p: Person) {
  if (!p.date_of_birth && !p.date_of_death) return null;
  return `${p.date_of_birth ?? "?"} – ${p.living_status === "living" ? "present" : p.date_of_death ?? "?"}`;
}

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMember(supabase, user!.id);

  const { data: personRaw } = await supabase.from("people").select("*").eq("id", id).maybeSingle();
  if (!personRaw) notFound();

  const person = await applyPrivacy(supabase, personRaw as Person, member);
  const isOwner = member?.person_id === person.id;
  const canManagePrivacy = isOwner || isAdmin(member);

  const [{ data: father }, { data: mother }, { data: spousesAsA }, { data: spousesAsB }, { data: auditEntries }] =
    await Promise.all([
      person.father_id
        ? supabase.from("people").select("id, full_name, surname_tag").eq("id", person.father_id).single()
        : Promise.resolve({ data: null }),
      person.mother_id
        ? supabase.from("people").select("id, full_name, surname_tag").eq("id", person.mother_id).single()
        : Promise.resolve({ data: null }),
      supabase.from("spouses").select("*, person_b:people!spouses_person_b_id_fkey(id, full_name, surname_tag)").eq("person_a_id", person.id),
      supabase.from("spouses").select("*, person_a:people!spouses_person_a_id_fkey(id, full_name, surname_tag)").eq("person_b_id", person.id),
      supabase
        .from("audit_log")
        .select("*, members!audit_log_performed_by_fkey(name)")
        .eq("person_id", person.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const marriages = [
    ...(spousesAsA ?? []).map((s) => ({ spouse: s.person_b, marriage_notes: s.marriage_notes, spouseId: s.person_b_id })),
    ...(spousesAsB ?? []).map((s) => ({ spouse: s.person_a, marriage_notes: s.marriage_notes, spouseId: s.person_a_id })),
  ];

  const { data: children } = await supabase
    .from("people")
    .select("id, full_name, surname_tag, father_id, mother_id")
    .or(`father_id.eq.${person.id},mother_id.eq.${person.id}`)
    .order("full_name");

  const { data: contactDetailsRaw } = await supabase
    .from("contact_details")
    .select("*")
    .eq("person_id", person.id)
    .order("created_at");
  const contactDetails = filterContactDetails((contactDetailsRaw ?? []) as ContactDetail[], person, member);

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

  return (
    <div className="space-y-6">
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
          <h1 className="text-2xl font-semibold text-slate-900">{displayName(person)}</h1>
          {person.preferred_name && <p className="text-sm text-slate-600">Goes by {person.preferred_name}</p>}
          {person.other_names && <p className="text-sm text-slate-500">Also known as {person.other_names}</p>}
          <div className="mt-1 flex items-center gap-2">
            <Badge
              className={
                person.living_status === "deceased"
                  ? "bg-slate-200 text-slate-700"
                  : person.living_status === "living"
                    ? "bg-green-100 text-green-800"
                    : "bg-slate-100 text-slate-500"
              }
            >
              {person.living_status}
            </Badge>
            {lifespan(person) && <span className="text-sm text-slate-500">{lifespan(person)}</span>}
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
                {displayName(father)}
              </Link>
            ) : (
              <span className="italic text-slate-400">Unknown</span>
            )}
          </div>
          <div>
            <div className="font-medium text-slate-500">Mother</div>
            {mother ? (
              <Link href={`/people/${mother.id}`} className="text-slate-900 hover:underline">
                {displayName(mother)}
              </Link>
            ) : (
              <span className="italic text-slate-400">Unknown</span>
            )}
          </div>
        </div>

        {marriages.length > 0 && (
          <div className="mt-4 space-y-3">
            {marriages.map((m, i) => (
              <div key={m.spouseId ?? i}>
                <div className="font-medium text-slate-500">
                  Spouse:{" "}
                  {m.spouse ? (
                    <Link href={`/people/${m.spouse.id}`} className="text-slate-900 hover:underline">
                      {displayName(m.spouse)}
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
                          {displayName(c)}
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
                    {displayName(c)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {(person.place_of_birth || person.place_of_death || person.current_location || person.bio || person.facebook_url || person.linkedin_url) && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Details</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {person.place_of_birth && (
              <div><dt className="font-medium text-slate-500">Place of birth</dt><dd>{person.place_of_birth}</dd></div>
            )}
            {person.place_of_death && (
              <div><dt className="font-medium text-slate-500">Place of death</dt><dd>{person.place_of_death}</dd></div>
            )}
            {person.current_location && (
              <div><dt className="font-medium text-slate-500">Current location</dt><dd>{person.current_location}</dd></div>
            )}
            {person.facebook_url && (
              <div><dt className="font-medium text-slate-500">Facebook</dt><dd><a className="text-slate-900 hover:underline" href={person.facebook_url} target="_blank" rel="noreferrer">{person.facebook_url}</a></dd></div>
            )}
            {person.linkedin_url && (
              <div><dt className="font-medium text-slate-500">LinkedIn</dt><dd><a className="text-slate-900 hover:underline" href={person.linkedin_url} target="_blank" rel="noreferrer">{person.linkedin_url}</a></dd></div>
            )}
          </dl>
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
                    <span className="text-slate-800">
                      {entry.label && <span className="text-slate-400">{entry.label}: </span>}
                      {entry.value}
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
          <form action={addContactDetail} className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-4">
            <input type="hidden" name="person_id" value={person.id} />
            <Select name="contact_type" defaultValue="phone">
              <option value="phone">Phone</option>
              <option value="email">Email</option>
              <option value="address">Address</option>
            </Select>
            <Input name="label" placeholder="Label (e.g. Mobile, Home)" />
            <Input name="value" placeholder="Value" required />
            <Select name="visibility" defaultValue="admins_only">
              <option value="everyone">Everyone</option>
              <option value="admins_only">Admins only</option>
              <option value="just_me">Just me</option>
            </Select>
            <div className="sm:col-span-4">
              <Button type="submit">Add</Button>
            </div>
          </form>
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
          <Field label="Date of birth"><Input name="date_of_birth" defaultValue={personRaw.date_of_birth ?? ""} placeholder="e.g. circa 1950" /></Field>
          <Field label="Date of death"><Input name="date_of_death" defaultValue={personRaw.date_of_death ?? ""} /></Field>
          <Field label="Place of birth"><Input name="place_of_birth" defaultValue={personRaw.place_of_birth ?? ""} /></Field>
          <Field label="Place of death"><Input name="place_of_death" defaultValue={personRaw.place_of_death ?? ""} /></Field>
          <Field label="Current location"><Input name="current_location" defaultValue={personRaw.current_location ?? ""} /></Field>
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
            <p className="text-sm font-medium text-slate-700 sm:col-span-2">Add a child of {displayName(person)}</p>
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
                  <option key={m.spouse.id} value={m.spouse.id}>{displayName(m.spouse)}</option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2"><Field label="Note to admin (optional)"><Input name="note" /></Field></div>
            <div className="sm:col-span-2"><Button type="submit">Submit for review</Button></div>
          </form>

          <form action={submitAddPerson} className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <input type="hidden" name="relation_to_person_id" value={person.id} />
            <input type="hidden" name="relation_type" value="spouse" />
            <p className="text-sm font-medium text-slate-700 sm:col-span-2">Add a spouse of {displayName(person)}</p>
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
              <p className="text-sm font-medium text-slate-700 sm:col-span-2">Add a parent of {displayName(person)}</p>
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
          <form action={updateFieldPrivacy} className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2">
            <input type="hidden" name="person_id" value={person.id} />
            {PRIVACY_FIELDS.map((field) => (
              <Field key={field} label={field.replace(/_/g, " ")}>
                <Select name={field} defaultValue="everyone">
                  <option value="everyone">Everyone in the family app</option>
                  <option value="admins_only">Admins only</option>
                  <option value="just_me">Just me</option>
                </Select>
              </Field>
            ))}
            <div className="sm:col-span-2"><Button type="submit">Save privacy settings</Button></div>
          </form>
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

      <details className="rounded-lg border border-red-200 bg-white">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-red-700">
          Propose removing this profile
        </summary>
        <form action={submitProposeDeletion} className="space-y-3 border-t border-red-100 p-4">
          <input type="hidden" name="person_id" value={person.id} />
          <Field label="Why should this profile be removed?">
            <Textarea name="note" rows={2} required />
          </Field>
          <Button type="submit" variant="danger">Submit for review</Button>
        </form>
      </details>
    </div>
  );
}
