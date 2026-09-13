// One-time import of the parsed legacy tree (supabase/legacy-data/*.json,
// produced by parse-legacy-tree.mjs) into a live Supabase project.
//
// Needs SUPABASE_SERVICE_ROLE_KEY (Settings > API > service_role — never
// the anon key) since this bypasses RLS to bulk-insert as the initial
// seed, before any admin session exists to do it through the app.
//
// Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-to-supabase.mjs

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// Minimal .env.local loader (avoids adding a dotenv dependency for one
// script) — only used here, not by the Next.js app itself.
const envPath = path.join(import.meta.dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local or the environment) first.");
  process.exit(1);
}

const dataDir = path.join(import.meta.dirname, "..", "supabase", "legacy-data");
const people = JSON.parse(fs.readFileSync(path.join(dataDir, "people.json"), "utf8"));
const spouses = JSON.parse(fs.readFileSync(path.join(dataDir, "spouses.json"), "utf8"));

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  const { count } = await supabase.from("people").select("id", { count: "exact", head: true });
  if (count && count > 0) {
    console.error(`people table already has ${count} rows — refusing to double-import. Truncate it first if you want to re-run this.`);
    process.exit(1);
  }

  const idByLegacyId = new Map(people.map((p) => [p.legacy_id, crypto.randomUUID()]));

  const peopleRows = people.map((p) => ({
    id: idByLegacyId.get(p.legacy_id),
    full_name: p.full_name,
    other_names: p.other_names,
    surname_tag: p.surname_tag,
    father_id: p.father_legacy_id ? idByLegacyId.get(p.father_legacy_id) : null,
    mother_id: p.mother_legacy_id ? idByLegacyId.get(p.mother_legacy_id) : null,
    living_status: "unknown",
    legacy_id: p.legacy_id,
  }));

  const spouseRows = spouses.map((s) => ({
    person_a_id: idByLegacyId.get(s.person_a_legacy_id),
    person_b_id: idByLegacyId.get(s.person_b_legacy_id),
    marriage_notes: s.marriage_notes,
  }));

  console.log(`Inserting ${peopleRows.length} people...`);
  for (let i = 0; i < peopleRows.length; i += 500) {
    const batch = peopleRows.slice(i, i + 500);
    const { error } = await supabase.from("people").insert(batch);
    if (error) throw new Error(`people batch ${i}: ${error.message}`);
    console.log(`  ${Math.min(i + 500, peopleRows.length)}/${peopleRows.length}`);
  }

  console.log(`Inserting ${spouseRows.length} spouse links...`);
  for (let i = 0; i < spouseRows.length; i += 500) {
    const batch = spouseRows.slice(i, i + 500);
    const { error } = await supabase.from("spouses").insert(batch);
    if (error) throw new Error(`spouses batch ${i}: ${error.message}`);
    console.log(`  ${Math.min(i + 500, spouseRows.length)}/${spouseRows.length}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
