"use client";

import { useMemo, useState } from "react";
import { PersonPicker } from "@/components/person-picker";
import { AddFamilyMemberForm } from "@/components/add-family-member-form";
import { displayNameText } from "@/components/person-name";

interface PersonWithParents {
  id: string;
  full_name: string;
  preferred_name: string | null;
  surname_tag: string | null;
  father_id: string | null;
  mother_id: string | null;
}

interface SpousePair {
  person_a_id: string;
  person_b_id: string;
}

/**
 * Standalone version of "Add a family member" — that form has always
 * needed an anchor person to add the new one relative to, which used to
 * mean going to that person's own profile first just to reach it. This
 * page is the same form, just with its own picker for the anchor up
 * front, so it works from a blank start instead of requiring you to
 * already be on someone's page. Fetches the full people list itself
 * (including father_id/mother_id) rather than a fresh round-trip per
 * anchor picked — AddFamilyMemberForm's own router.refresh() after a
 * successful add re-fetches this whole list anyway, keeping it current.
 */
export function AddPersonScreen({ people, spouses }: { people: PersonWithParents[]; spouses: SpousePair[] }) {
  const [anchor, setAnchor] = useState<{ id: string; name: string } | null>(null);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const anchorPerson = anchor ? peopleById.get(anchor.id) : null;

  const existingChildren = useMemo(
    () => (anchorPerson ? people.filter((p) => p.father_id === anchorPerson.id || p.mother_id === anchorPerson.id) : []),
    [people, anchorPerson],
  );
  const existingSiblings = useMemo(
    () =>
      anchorPerson
        ? people.filter(
            (p) =>
              p.id !== anchorPerson.id &&
              ((anchorPerson.father_id && p.father_id === anchorPerson.father_id) ||
                (anchorPerson.mother_id && p.mother_id === anchorPerson.mother_id)),
          )
        : [],
    [people, anchorPerson],
  );
  const existingSpouses = useMemo(() => {
    if (!anchorPerson) return [];
    const spouseIds = spouses
      .filter((s) => s.person_a_id === anchorPerson.id || s.person_b_id === anchorPerson.id)
      .map((s) => (s.person_a_id === anchorPerson.id ? s.person_b_id : s.person_a_id));
    return spouseIds.map((id) => peopleById.get(id)).filter((p): p is PersonWithParents => !!p);
  }, [spouses, anchorPerson, peopleById]);

  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <label className="mb-1 block text-sm font-medium text-slate-700">Who is the new person related to?</label>
        <PersonPicker
          name="anchor"
          people={people}
          placeholder="Search for someone already in the tree…"
          autoFocus
          onSelect={(id, p) => setAnchor(p ? { id, name: displayNameText(p) } : null)}
        />
      </div>

      {anchorPerson && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-3 text-sm text-slate-600">
            Adding someone related to <span className="font-medium text-slate-900">{anchor!.name}</span>.
          </p>
          <AddFamilyMemberForm
            key={anchorPerson.id}
            personId={anchorPerson.id}
            hasFather={!!anchorPerson.father_id}
            hasMother={!!anchorPerson.mother_id}
            people={people}
            existingChildren={existingChildren}
            existingSiblings={existingSiblings}
            existingSpouses={existingSpouses}
          />
        </div>
      )}
    </div>
  );
}
