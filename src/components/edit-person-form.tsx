"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitPersonEdit } from "@/lib/actions/pending-changes";
import { Field, Input, Select, Textarea, Button } from "@/components/ui";
import { PersonPhotoUpload } from "@/components/person-photo-upload";
import type { Person } from "@/lib/types";

/**
 * Same submission-lifecycle pattern as AddFamilyMemberForm: the outer
 * component owns pending/success/error state and a "generation" key; the
 * inner one owns the actual field state and remounts fresh on a bumped
 * generation. Without this, a non-admin's edit sits in Pending Approvals
 * with zero visible confirmation on their own screen, and the form data
 * just stays there looking unsubmitted — which is exactly what led to the
 * same edit being submitted three or four times over.
 */
export function EditPersonForm({ personId, personRaw }: { personId: string; personRaw: Person }) {
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
        await submitPersonEdit(formData);
        setSubmitted(true);
        setGeneration((g) => g + 1);
        // The remount above only resets the form's own state — personRaw is
        // a prop from the parent Server Component, captured at the last page
        // load, and stays stale (still showing pre-edit values as defaults)
        // until that component re-runs. router.refresh() re-fetches it, so
        // an admin's auto-applied edit (or anyone re-opening the form right
        // after) sees what was actually just saved, not what it looked like
        // before — otherwise a field that truly did save can look like it
        // silently reverted, and it's not obvious why re-submitting again
        // doesn't seem to "take".
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong — please try again.");
      }
    });
  }

  return (
    <div className="space-y-3 p-4">
      {/*
        Keying on generation ALONE would remount immediately when it bumps,
        using whatever personRaw this closure still has at that instant —
        which is the PRE-edit value, since router.refresh() hasn't resolved
        yet. An uncontrolled input's defaultValue is only read at mount, so
        that remount would permanently lock the form onto stale data; once
        personRaw updates a moment later, nothing prompts another remount to
        pick it up. Folding personRaw.updated_at into the key fixes it: for
        an admin's auto-applied edit, the key changes AGAIN the instant the
        refreshed (updated_at-bumped) personRaw actually lands, forcing a
        second remount with genuinely fresh values. For a non-admin's edit
        (queued as pending, nothing on the person row changes yet) only the
        generation half of the key moves, which is exactly right — the
        still-accurate current values are what should show anyway.
      */}
      <FormFields
        key={`${generation}:${personRaw.updated_at}`}
        personId={personId}
        personRaw={personRaw}
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
  personRaw,
  onSubmit,
  isPending,
  submitted,
  error,
}: {
  personId: string;
  personRaw: Person;
  onSubmit: (formData: FormData) => void;
  isPending: boolean;
  submitted: boolean;
  error: string | null;
}) {
  return (
    <form action={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="person_id" value={personId} />
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

      <div className="sm:col-span-2">
        <Field label="Birth order among siblings (only used when the exact year above is unknown)">
          <Input
            name="birth_order"
            type="number"
            min={1}
            placeholder="e.g. 2 for second child"
            defaultValue={personRaw.birth_order ?? ""}
          />
        </Field>
      </div>

      <Field label="Place of birth"><Input name="place_of_birth" defaultValue={personRaw.place_of_birth ?? ""} /></Field>
      <Field label="Place of death"><Input name="place_of_death" defaultValue={personRaw.place_of_death ?? ""} /></Field>
      <div className="sm:col-span-2">
        <Field label="Photo">
          <PersonPhotoUpload
            personId={personId}
            hasExistingPhoto={!!personRaw.photo_url}
            previousPhotoUrl={personRaw.photo_url}
            previousThumbnailUrl={personRaw.photo_thumbnail_url}
          />
        </Field>
      </div>
      <Field label="Facebook URL"><Input name="facebook_url" defaultValue={personRaw.facebook_url ?? ""} /></Field>
      <Field label="LinkedIn URL"><Input name="linkedin_url" defaultValue={personRaw.linkedin_url ?? ""} /></Field>
      <div className="sm:col-span-2"><Field label="Bio / notes"><Textarea name="bio" rows={3} defaultValue={personRaw.bio ?? ""} /></Field></div>
      <div className="sm:col-span-2"><Field label="Note to admin (optional)"><Input name="note" placeholder="e.g. source for this info" /></Field></div>
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
