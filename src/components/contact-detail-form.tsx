"use client";

import { useState } from "react";
import { addContactDetail } from "@/lib/actions/contact-details";
import { Field, Input, Select, Button } from "@/components/ui";
import { COUNTRIES, DEFAULT_COUNTRY_ISO2 } from "@/lib/countries";
import type { ContactType, PrivacyVisibility } from "@/lib/types";

export function ContactDetailForm({
  personId,
  groups,
}: {
  personId: string;
  groups: { id: string; name: string }[];
}) {
  const [contactType, setContactType] = useState<ContactType>("phone");
  const [visibility, setVisibility] = useState<PrivacyVisibility>("just_me");

  return (
    <form action={addContactDetail} className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      <input type="hidden" name="person_id" value={personId} />

      <div className="flex flex-wrap gap-2">
        <Select
          name="contact_type"
          value={contactType}
          onChange={(e) => setContactType(e.target.value as ContactType)}
          className="w-28 shrink-0"
        >
          <option value="phone">Phone</option>
          <option value="email">Email</option>
          <option value="address">Address</option>
        </Select>
        <Input name="label" placeholder="Label (e.g. Mobile)" className="w-36 shrink-0" />
        {contactType === "phone" && (
          <Select name="country_iso2" required defaultValue={DEFAULT_COUNTRY_ISO2} className="w-20 shrink-0">
            {COUNTRIES.map((c) => (
              <option key={c.iso2} value={c.iso2}>
                +{c.dialCode}
              </option>
            ))}
          </Select>
        )}
      </div>

      {contactType === "phone" ? (
        <Input name="local_number" placeholder="Phone number" required />
      ) : (
        <Input name="value" placeholder={contactType === "email" ? "Email address" : "Address"} required />
      )}

      <Select
        name="visibility"
        value={visibility}
        onChange={(e) => setVisibility(e.target.value as PrivacyVisibility)}
        className="w-56"
      >
        <option value="just_me">Just me</option>
        <option value="everyone">Everyone in the family app</option>
        <option value="groups">Specific group(s)</option>
      </Select>

      {visibility === "groups" && (
        <div>
          <Field label="Which group(s) can see this?">
            <Select name="group_ids" multiple required className="h-24">
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          {groups.length === 0 && (
            <p className="mt-1 text-xs text-slate-400">
              You&apos;re not in any groups yet — join one from the Groups page first.
            </p>
          )}
        </div>
      )}

      <Button type="submit">Add</Button>
    </form>
  );
}
