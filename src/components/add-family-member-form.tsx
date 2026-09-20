"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { submitFamilyRelation } from "@/lib/actions/pending-changes";
import { Field, Input, Select, Button } from "@/components/ui";
import { PersonPicker, type PersonOption } from "@/components/person-picker";
import { displayNameText } from "@/components/person-name";
import { COUNTRIES, DEFAULT_COUNTRY_ISO2 } from "@/lib/countries";

type Relation = "father" | "mother" | "son" | "daughter" | "brother" | "sister" | "husband" | "wife";

const RELATIONS: { value: Relation; label: string }[] = [
  { value: "father", label: "Father" },
  { value: "mother", label: "Mother" },
  { value: "son", label: "Son" },
  { value: "daughter", label: "Daughter" },
  { value: "brother", label: "Brother" },
  { value: "sister", label: "Sister" },
  { value: "husband", label: "Husband" },
  { value: "wife", label: "Wife" },
];

interface FormProps {
  personId: string;
  hasFather: boolean;
  hasMother: boolean;
  people: PersonOption[];
  /** Whoever's already recorded in each category — shown next to the Relation picker so a duplicate is obvious before submitting, not after. */
  existingChildren?: PersonOption[];
  existingSiblings?: PersonOption[];
  existingSpouses?: PersonOption[];
}

/**
 * The outer component owns the submission lifecycle (pending/success/error)
 * and a "generation" key; the inner one owns the actual field state. Bumping
 * the key after a successful submit remounts the fields component fresh —
 * clearing every input (including PersonPicker's own internal state, which
 * a plain form.reset() wouldn't touch) and resetting relation/mode back to
 * their defaults — instead of leaving stale data sitting in an unconfirmed
 * form that looks like the submission never happened.
 */
export function AddFamilyMemberForm(props: FormProps) {
  const router = useRouter();
  const [generation, setGeneration] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setSubmitted(false);
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitFamilyRelation(formData);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setSubmitted(true);
        setGeneration((g) => g + 1);
        // hasFather/hasMother (and the Family list elsewhere on the page)
        // are props from the parent Server Component, so they'd otherwise
        // stay stale after an admin's auto-applied add — e.g. still
        // offering "Father" as pickable after one was just added.
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong — please try again.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <FormFields
        key={generation}
        {...props}
        onSubmit={handleSubmit}
        isPending={isPending}
        submitted={submitted}
        error={error}
      />
    </div>
  );
}

function FormFields({
  personId,
  hasFather,
  hasMother,
  people,
  existingChildren,
  existingSiblings,
  existingSpouses,
  onSubmit,
  isPending,
  submitted,
  error,
}: FormProps & { onSubmit: (formData: FormData) => void; isPending: boolean; submitted: boolean; error: string | null }) {
  const [relation, setRelation] = useState<Relation>("son");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const isSpouse = relation === "husband" || relation === "wife";
  const isChild = relation === "son" || relation === "daughter";
  // A child added to someone with a spouse is (almost always) that couple's
  // child, so the spouse is recorded as the other parent unless unticked —
  // otherwise it shows up as a child with one parent unknown, and siblings
  // look like half-siblings. Several spouses: pick which one.
  const spouseOptions = existingSpouses ?? [];
  const [includeOther, setIncludeOther] = useState(true);
  const [otherChoice, setOtherChoice] = useState("");

  // Father/mother aren't included here — the dropdown above already
  // disables those once hasFather/hasMother is true, which covers the
  // same "don't re-add" concern for a slot only one person can ever fill.
  const existingForRelation =
    relation === "son" || relation === "daughter"
      ? existingChildren
      : relation === "brother" || relation === "sister"
        ? existingSiblings
        : isSpouse
          ? existingSpouses
          : undefined;

  return (
    <form action={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="person_id" value={personId} />

      <div className="sm:col-span-2 space-y-2">
        {submitted && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            Submitted — an admin will review it soon. It won&apos;t show up here yet, so there&apos;s no need to
            submit it again.
          </p>
        )}
        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-1 text-xs font-medium text-red-800 underline hover:text-red-900"
            >
              If that looks wrong, reload the page and try again
            </button>
          </div>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Submitting…" : "Submit for review"}
        </Button>
      </div>

      <div className="sm:col-span-2">
        <Field label="Relation">
          <Select name="relation" value={relation} onChange={(e) => setRelation(e.target.value as Relation)}>
            {RELATIONS.map((r) => {
              const disabled = (r.value === "father" && hasFather) || (r.value === "mother" && hasMother);
              return (
                <option key={r.value} value={r.value} disabled={disabled}>
                  {r.label}
                  {disabled ? " (already recorded)" : ""}
                </option>
              );
            })}
          </Select>
        </Field>
      </div>

      {existingForRelation && existingForRelation.length > 0 && (
        <div className="sm:col-span-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <span className="font-medium">Already recorded, so double-check before adding another:</span>{" "}
          {existingForRelation.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ", "}
              <Link href={`/people/${p.id}`} target="_blank" className="underline hover:no-underline">
                {displayNameText(p)}
              </Link>
            </span>
          ))}
        </div>
      )}

      {isChild && spouseOptions.length === 1 && (
        <div className="sm:col-span-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={includeOther}
              onChange={(e) => setIncludeOther(e.target.checked)}
            />
            <span>
              Also record <b>{displayNameText(spouseOptions[0])}</b> as the other parent (their husband/wife).
              Untick only if this child is from a different marriage.
            </span>
          </label>
          {includeOther ? (
            <input type="hidden" name="other_parent_id" value={spouseOptions[0].id} />
          ) : (
            <input type="hidden" name="other_parent_choice" value="none" />
          )}
        </div>
      )}
      {isChild && spouseOptions.length > 1 && (
        <div className="sm:col-span-2">
          <Field label="Who is the other parent?">
            <Select value={otherChoice} onChange={(e) => setOtherChoice(e.target.value)} required>
              <option value="">Choose…</option>
              {spouseOptions.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {displayNameText(sp)}
                </option>
              ))}
              <option value="none">Not sure — leave blank</option>
            </Select>
          </Field>
          {otherChoice === "none" ? (
            <input type="hidden" name="other_parent_choice" value="none" />
          ) : otherChoice ? (
            <input type="hidden" name="other_parent_id" value={otherChoice} />
          ) : null}
        </div>
      )}

      <div className="sm:col-span-2 flex gap-4 text-sm text-slate-700">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="mode"
            value="existing"
            checked={mode === "existing"}
            onChange={() => setMode("existing")}
          />
          Pick someone already in the tree
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="mode" value="new" checked={mode === "new"} onChange={() => setMode("new")} />
          Add a new person
        </label>
      </div>

      {mode === "existing" ? (
        <div className="sm:col-span-2">
          <Field label="Search for the person">
            <PersonPicker name="existing_person_id" people={people} placeholder="Search by name…" />
          </Field>
        </div>
      ) : (
        <>
          <Field label="Full name">
            <Input name="full_name" required />
          </Field>
          <Field label="Surname tag">
            <Input name="surname_tag" />
          </Field>
          <Field label="Living status">
            <Select name="living_status" defaultValue="unknown">
              <option value="unknown">Unknown</option>
              <option value="living">Living</option>
              <option value="deceased">Deceased</option>
            </Select>
          </Field>
          <Field label="Year of birth">
            <Input name="birth_year" type="number" placeholder="Year" />
          </Field>
          <div className="sm:col-span-2 grid grid-cols-2 gap-3">
            <Field label="Month of birth">
              <Input name="birth_month" type="number" placeholder="Month" min={1} max={12} />
            </Field>
            <Field label="Day of birth">
              <Input name="birth_day" type="number" placeholder="Day" min={1} max={31} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Birth order among siblings (only used when the exact year above is unknown)">
              <Input name="birth_order" type="number" min={1} placeholder="e.g. 2 for second child" />
            </Field>
          </div>
          <Field label="Phone (optional)">
            <div className="flex gap-2">
              <Select name="phone_country" defaultValue={DEFAULT_COUNTRY_ISO2} className="w-28 shrink-0">
                {COUNTRIES.map((c) => (
                  <option key={c.iso2} value={c.iso2}>
                    +{c.dialCode}
                  </option>
                ))}
              </Select>
              <Input name="phone_number" placeholder="Phone number" className="flex-1" />
            </div>
          </Field>
          <Field label="Email (optional)">
            <Input name="email" type="email" />
          </Field>
        </>
      )}

      {isSpouse && (
        <div className="sm:col-span-2">
          <Field label="Marriage notes (optional)">
            <Input name="marriage_notes" />
          </Field>
        </div>
      )}

      <div className="sm:col-span-2">
        <Field label="Note to admin (optional)">
          <Input name="note" />
        </Field>
      </div>
      <div className="sm:col-span-2 space-y-2">
        {submitted && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            Submitted — an admin will review it soon. It won&apos;t show up here yet, so there&apos;s no need to
            submit it again.
          </p>
        )}
        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-1 text-xs font-medium text-red-800 underline hover:text-red-900"
            >
              If that looks wrong, reload the page and try again
            </button>
          </div>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Submitting…" : "Submit for review"}
        </Button>
      </div>
    </form>
  );
}
