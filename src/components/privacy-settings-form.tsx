"use client";

import { useState } from "react";
import { updateFieldPrivacy } from "@/lib/actions/privacy";
import { Field, Select, Button } from "@/components/ui";
import { PRIVACY_FIELDS, type PrivacyVisibility } from "@/lib/types";

const FIELD_LABELS: Record<string, string> = {
  birth_date: "Date of birth",
  death_date: "Date of death",
  current_location: "Current location (city, country)",
  facebook_url: "Facebook",
  linkedin_url: "LinkedIn",
  place_of_birth: "Place of birth",
  place_of_death: "Place of death",
};

export function PrivacySettingsForm({
  personId,
  currentVisibility,
  currentGroupIds,
  groups,
}: {
  personId: string;
  currentVisibility: Record<string, PrivacyVisibility>;
  currentGroupIds: Record<string, string[]>;
  groups: { id: string; name: string }[];
}) {
  // Admins can see everything regardless of this setting, so "just admins"
  // isn't offered as a choice here — it would misleadingly read as a real
  // privacy tier when it isn't one. Any field already stored as
  // admins_only (e.g. from the admin-set default on an unclaimed profile)
  // displays as "Just me" instead, since the two are equivalent from every
  // non-admin viewer's perspective.
  const normalize = (v: PrivacyVisibility) => (v === "admins_only" ? "just_me" : v);
  const [visibility, setVisibility] = useState<Record<string, PrivacyVisibility>>(
    Object.fromEntries(Object.entries(currentVisibility).map(([field, v]) => [field, normalize(v)])),
  );

  return (
    <form action={updateFieldPrivacy} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="person_id" value={personId} />
      {PRIVACY_FIELDS.map((field) => (
        <div key={field}>
          <Field label={FIELD_LABELS[field] ?? field.replace(/_/g, " ")}>
            <Select
              name={field}
              value={visibility[field] ?? "everyone"}
              onChange={(e) => setVisibility((prev) => ({ ...prev, [field]: e.target.value as PrivacyVisibility }))}
            >
              <option value="everyone">Everyone in Nams Family App</option>
              <option value="groups">Specific group(s)</option>
              <option value="just_me">Just me (not recommended)</option>
            </Select>
          </Field>
          {visibility[field] === "groups" && (
            <Select name={`groups_${field}`} multiple defaultValue={currentGroupIds[field] ?? []} className="mt-1 h-20">
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      ))}
      <div className="sm:col-span-2">
        <Button type="submit">Save privacy settings</Button>
      </div>
    </form>
  );
}
