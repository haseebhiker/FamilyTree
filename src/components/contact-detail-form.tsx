"use client";

import { useState } from "react";
import { AsYouType, type CountryCode } from "libphonenumber-js";
import { addContactDetail } from "@/lib/actions/contact-details";
import { Input, Select, Button } from "@/components/ui";
import { COUNTRIES, DEFAULT_COUNTRY_ISO2 } from "@/lib/countries";
import type { ContactType } from "@/lib/types";

const LABEL_OPTIONS: Record<ContactType, string[]> = {
  phone: ["Mobile", "Home", "Work"],
  email: ["Personal", "Work"],
  address: ["Home", "Work"],
};

export function ContactDetailForm({ personId }: { personId: string }) {
  const [contactType, setContactType] = useState<ContactType>("phone");
  const [label, setLabel] = useState(LABEL_OPTIONS.phone[0]);
  const [countryIso2, setCountryIso2] = useState(DEFAULT_COUNTRY_ISO2);
  const [localNumber, setLocalNumber] = useState("");

  function reformat(rawDigits: string, iso2: string) {
    return new AsYouType(iso2 as CountryCode).input(rawDigits);
  }

  function handleNumberChange(value: string) {
    setLocalNumber(reformat(value, countryIso2));
  }

  function handleCountryChange(iso2: string) {
    setCountryIso2(iso2);
    // Re-format whatever digits are already typed against the new country's
    // conventions, rather than just resetting the field.
    const digitsOnly = localNumber.replace(/\D/g, "");
    setLocalNumber(digitsOnly ? reformat(digitsOnly, iso2) : "");
  }

  return (
    <form action={addContactDetail} className="space-y-2">
      <input type="hidden" name="person_id" value={personId} />

      <div className="flex flex-wrap items-center gap-2">
        <Select
          name="contact_type"
          value={contactType}
          onChange={(e) => {
            const next = e.target.value as ContactType;
            setContactType(next);
            setLabel(LABEL_OPTIONS[next][0]);
          }}
          className="w-24 shrink-0"
        >
          <option value="phone">Phone</option>
          <option value="email">Email</option>
          <option value="address">Address</option>
        </Select>

        <Select
          name={label === "Other" ? undefined : "label"}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-24 shrink-0"
        >
          {LABEL_OPTIONS[contactType].map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
          <option value="Other">Other…</option>
        </Select>
        {label === "Other" && (
          <Input name="label" placeholder="Custom label" className="w-24 shrink-0" required />
        )}

        {contactType === "phone" && (
          <Select
            name="country_iso2"
            required
            value={countryIso2}
            onChange={(e) => handleCountryChange(e.target.value)}
            className="w-32 shrink-0"
          >
            {COUNTRIES.map((c) => (
              <option key={c.iso2} value={c.iso2}>
                +{c.dialCode} {c.name}
              </option>
            ))}
          </Select>
        )}

        {contactType === "phone" ? (
          <Input
            name="local_number"
            placeholder="Phone number"
            required
            className="min-w-32 flex-1"
            value={localNumber}
            onChange={(e) => handleNumberChange(e.target.value)}
            inputMode="tel"
          />
        ) : (
          <Input
            name="value"
            placeholder={contactType === "email" ? "Email address" : "Address"}
            required
            className="min-w-32 flex-1"
          />
        )}

        <Button type="submit" className="shrink-0">Add</Button>
      </div>
      <p className="text-xs text-slate-400">
        Only admins can see this until you choose who else can — set that from &quot;My Privacy Settings&quot; (in
        the ☰ menu).
      </p>
    </form>
  );
}
