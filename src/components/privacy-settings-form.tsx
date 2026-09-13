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
  const [visibility, setVisibility] = useState<Record<string, PrivacyVisibility>>(currentVisibility);

  return (
    <form action={updateFieldPrivacy} className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2">
      <input type="hidden" name="person_id" value={personId} />
      {PRIVACY_FIELDS.map((field) => (
        <div key={field}>
          <Field label={FIELD_LABELS[field] ?? field.replace(/_/g, " ")}>
            <Select
              name={field}
              value={visibility[field] ?? "admins_only"}
              onChange={(e) => setVisibility((prev) => ({ ...prev, [field]: e.target.value as PrivacyVisibility }))}
            >
              <option value="admins_only">Just admins</option>
              <option value="everyone">Everyone in the family app</option>
              <option value="groups">Specific group(s)</option>
              <option value="just_me">Just me</option>
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
