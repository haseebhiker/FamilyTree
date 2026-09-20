"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import { encryptValue, decryptValue } from "@/lib/vault-crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export interface ImportItem {
  personId: string;
  phones: { value: string; label: string }[];
  emails: { value: string; label: string }[];
}

export type ImportResult = { added: number; duplicates: number; invalid: string[] } | { error: string };

const MAX_PEOPLE_PER_CALL = 150;
const DEFAULT_REGION = "US";

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** "0044 20 ..." is the international prefix outside the US — read it as "+44 20 ...". */
const parsePhone = (raw: string) => parsePhoneNumberFromString(raw.trim().replace(/^00/, "+"), DEFAULT_REGION);

/**
 * Saves the contact numbers/emails an admin ticked on the Import Contacts
 * page onto the chosen profiles — as admin-only (the app's default for
 * contact details), encrypted like every other one. Numbers already on the
 * profile are skipped, and phone numbers are tidied to the international
 * format. Returns errors as data (a thrown Server Action error reaches the
 * browser as a stripped "#441" in production).
 */
export async function importContacts(items: ImportItem[]): Promise<ImportResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not signed in" };
    const member = await getCurrentMember(supabase, user.id);
    if (!member || !isAdmin(member)) return { error: "Admins only" };

    if (!Array.isArray(items) || items.length === 0) return { error: "Nothing selected to save" };
    if (items.length > MAX_PEOPLE_PER_CALL) return { error: `Too many at once (max ${MAX_PEOPLE_PER_CALL}) — the page saves in batches` };

    const personIds = [...new Set(items.map((i) => i.personId))];
    const { data: existing, error: existingError } = await supabase
      .from("contact_details")
      .select("person_id, contact_type, value")
      .in("person_id", personIds);
    if (existingError) return { error: existingError.message };

    const compareKey = (type: string, v: string) =>
      type === "phone" ? (parsePhone(v)?.number ?? v) : v.trim().toLowerCase();
    const have = new Set<string>();
    for (const r of existing ?? []) {
      try {
        have.add(`${r.person_id}|${r.contact_type}|${compareKey(r.contact_type, decryptValue(r.value))}`);
      } catch {
        // an unreadable existing row just can't be used for de-duplication
      }
    }

    const rows: { person_id: string; contact_type: string; label: string; value: string; visibility: string }[] = [];
    const invalid: string[] = [];
    let duplicates = 0;

    for (const item of items) {
      for (const ph of item.phones ?? []) {
        const parsed = parsePhone(String(ph.value ?? ""));
        if (!parsed || !parsed.isValid()) {
          invalid.push(String(ph.value));
          continue;
        }
        const key = `${item.personId}|phone|${parsed.number}`;
        if (have.has(key)) {
          duplicates++;
          continue;
        }
        have.add(key);
        rows.push({ person_id: item.personId, contact_type: "phone", label: ph.label || "Mobile", value: encryptValue(parsed.number), visibility: "admins_only" });
      }
      for (const em of item.emails ?? []) {
        const v = String(em.value ?? "").trim();
        if (!looksLikeEmail(v)) {
          invalid.push(v);
          continue;
        }
        const key = `${item.personId}|email|${v.toLowerCase()}`;
        if (have.has(key)) {
          duplicates++;
          continue;
        }
        have.add(key);
        rows.push({ person_id: item.personId, contact_type: "email", label: em.label || "Personal", value: encryptValue(v), visibility: "admins_only" });
      }
    }

    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase.from("contact_details").insert(rows.slice(i, i + 100));
      if (error) return { error: `Saved ${i} so far, then: ${error.message}` };
    }

    if (rows.length > 0) {
      await supabase.from("audit_log").insert({
        person_id: null,
        change_type: "contact_import",
        old_value: null,
        new_value: { people: personIds.length, added: rows.length, duplicates_skipped: duplicates },
        performed_by: member.id,
        note: "Contacts imported from a phone contacts file (admin-only visibility)",
      });
    }
    return { added: rows.length, duplicates, invalid };
  } catch (e) {
    console.error("[importContacts]", e);
    return { error: e instanceof Error ? e.message : "Something went wrong — please try again." };
  }
}
