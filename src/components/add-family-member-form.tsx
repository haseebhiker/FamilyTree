"use client";

import { useState, useTransition } from "react";
import { submitFamilyRelation } from "@/lib/actions/pending-changes";
import { Field, Input, Select, Button } from "@/components/ui";
import { PersonPicker, type PersonOption } from "@/components/person-picker";
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
  const [generation, setGeneration] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setSubmitted(false);
    setError(null);
    startTransition(async () => {
      try {
        await submitFamilyRelation(formData);
        setSubmitted(true);
        setGeneration((g) => g + 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong — please try again.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {submitted && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Submitted — an admin will review it soon. It won&apos;t show up here yet, so there&apos;s no need to
          submit it again.
        </p>
      )}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <FormFields key={generation} {...props} onSubmit={handleSubmit} isPending={isPending} />
    </div>
  );
}

function FormFields({
  personId,
  hasFather,
  hasMother,
  people,
  onSubmit,
  isPending,
}: FormProps & { onSubmit: (formData: FormData) => void; isPending: boolean }) {
  const [relation, setRelation] = useState<Relation>("son");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const isSpouse = relation === "husband" || relation === "wife";

  return (
    <form action={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="person_id" value={personId} />

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
      <div className="sm:col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Submitting…" : "Submit for review"}
        </Button>
      </div>
    </form>
  );
}
