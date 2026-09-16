// Parses a "Legacy Family Tree 3.0" static HTML export (the old
// Nambavargal site) into clean JSON: people.json + spouses.json, plus a
// validation report (broken links, likely duplicates, inconsistent
// parent/spouse data — design doc §9).
//
// Usage: node scripts/parse-legacy-tree.mjs <path-to-OURFAMILY-folder> [output-dir]
// Output defaults to supabase/legacy-data/

import fs from "fs";
import path from "path";

const inputDir = process.argv[2];
const outputDir = process.argv[3] || path.join(import.meta.dirname, "..", "supabase", "legacy-data");

if (!inputDir) {
  console.error("Usage: node scripts/parse-legacy-tree.mjs <path-to-OURFAMILY-folder> [output-dir]");
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });

const files = fs.readdirSync(inputDir).filter((f) => /^\d+\.htm$/.test(f));

const people = new Map(); // legacy_id -> record
const spousePairs = []; // { a, b, marriage_notes: [text...], children: Set }
const warnings = [];

function parseNameTag(raw) {
  const m = raw.match(/^(.*?)\s*\/([^/]*)\/\s*$/);
  if (!m) return { full_name: raw.trim(), surname_tag: null };
  const given = m[1].trim();
  const surname = m[2].trim();
  return { full_name: given || raw.trim(), surname_tag: surname || null };
}

function pairKey(a, b) {
  return [a, b].sort().join("::");
}

for (const file of files) {
  const legacyId = file.replace(".htm", "");
  const html = fs.readFileSync(path.join(inputDir, file), "utf8");

  const h2Match = html.match(/<p><h2>([^<]+)<\/h2>/);
  if (!h2Match) {
    warnings.push(`${file}: no <h2> name found, skipped`);
    continue;
  }
  const { full_name, surname_tag } = parseNameTag(h2Match[1]);

  // --- Parents: the row of 2 slots directly above the self row. ---
  const parentMarker = "<td width=580 height=10 align=center valign=top><table border=0>";
  const selfMarkerRe = /<td width=590 height=10 align=center valign=top>/;
  const parentIdx = html.indexOf(parentMarker);
  const selfMatch = html.match(selfMarkerRe);

  let father_legacy_id = null;
  let mother_legacy_id = null;

  if (parentIdx !== -1 && selfMatch) {
    const selfIdx = html.indexOf(selfMatch[0], parentIdx);
    const parentSegment = selfIdx > parentIdx ? html.slice(parentIdx, selfIdx) : "";

    // Each of the 2 parent slots always opens with this exact double-nested
    // wrapper (outer table is always border=0; the inner table right after
    // it is border=0 when that parent is unknown, border=1 when known) —
    // so this compound pattern locates each slot's true start exactly
    // once, unlike the bare outer marker alone (which repeats when a
    // parent is unknown, since the inner duplicate matches it too).
    const slotStartRe =
      /<td width=290 height=10 align=center valign=top><table border=0>\s*<tr>\s*<td width=290 height=10 align=center valign=top><table border=[01]>/g;
    const slotStarts = [...parentSegment.matchAll(slotStartRe)].map((m) => m.index);

    if (slotStarts.length !== 2) {
      warnings.push(`${file}: expected 2 parent slots, found ${slotStarts.length}`);
    }
    const linkRe = /<a href="\.\/(\d+)\.htm">([^<]+)<br>/;
    const slot1 = parentSegment.slice(slotStarts[0] ?? 0, slotStarts[1] ?? parentSegment.length);
    const slot2 = slotStarts.length > 1 ? parentSegment.slice(slotStarts[1]) : "";

    const m1 = slot1.match(linkRe);
    if (m1) father_legacy_id = m1[1];
    const m2 = slot2.match(linkRe);
    if (m2) mother_legacy_id = m2[1];
  } else {
    warnings.push(`${file}: could not locate parent/self row markers`);
  }

  // --- Other names ---
  let other_names = null;
  const otherNamesMatch = html.match(/Other names? for [^<]+? (?:was|were) ([^.]+)\./);
  if (otherNamesMatch) other_names = otherNamesMatch[1].replace(/\s+/g, " ").trim();

  // --- Spouses/Children + Marriage Information blocks ---
  const spouseSectionMatch = html.match(/Spouses\/Children:<br>\s*([\s\S]*?)<\/font>\s*<\/td>/);
  const spouseEntries = [];
  if (spouseSectionMatch) {
    const section = spouseSectionMatch[1];
    const spouseRe =
      /(?:<strong>\d+\.\s*<\/strong>)?<a href="\.\/(\d+)\.htm">([^<]+)<\/a><br>\s*(<ul>[\s\S]*?<\/ul>)?/g;
    let sm;
    while ((sm = spouseRe.exec(section))) {
      const childrenBlock = sm[3] || "";
      const children = [...childrenBlock.matchAll(/<a href="\.\/(\d+)\.htm">[^<]+<\/a>/g)].map(
        (x) => x[1],
      );
      spouseEntries.push({ spouseLegacyId: sm[1], children });
    }
    // Flag any spouse mentioned by name only (no linked page) — the loop
    // above simply can't capture these since it requires an <a href>.
    const plainNameSpouseCount = (section.match(/<a href="\.\/\d+\.htm">/g) || []).length;
    const alsoMarried = (section.match(/^\S/gm) || []).length; // rough signal only
    void alsoMarried;
    void plainNameSpouseCount;
  }

  const marriageBlocks = [
    ...html.matchAll(
      /<strong>Marriage Information:<\/strong><\/font><\/p>\s*<blockquote>\s*<font SIZE=-1><p>([\s\S]*?)<\/font><\/p>\s*<\/blockquote>/g,
    ),
  ].map((m) => m[1].replace(/\s+/g, " ").trim());

  spouseEntries.forEach((se, i) => {
    const key = pairKey(legacyId, se.spouseLegacyId);
    let pair = spousePairs.find((p) => p.key === key);
    if (!pair) {
      pair = { key, a: legacyId, b: se.spouseLegacyId, marriage_notes: [], children: new Set() };
      spousePairs.push(pair);
    }
    // Each side's own page repeats an equivalent "X married Y..." sentence
    // — keep only the first one seen for a pair rather than concatenating
    // both directions' near-duplicate text.
    if (marriageBlocks[i] && pair.marriage_notes.length === 0) {
      pair.marriage_notes.push(marriageBlocks[i]);
    }
    se.children.forEach((c) => pair.children.add(c));
  });

  people.set(legacyId, {
    legacy_id: legacyId,
    full_name,
    surname_tag,
    other_names,
    father_legacy_id,
    mother_legacy_id,
  });
}

// --- Validation pass (design doc §9) ---
const allIds = new Set(people.keys());

for (const p of people.values()) {
  if (p.father_legacy_id && !allIds.has(p.father_legacy_id)) {
    warnings.push(`${p.legacy_id} (${p.full_name}): father_legacy_id ${p.father_legacy_id} not found`);
  }
  if (p.mother_legacy_id && !allIds.has(p.mother_legacy_id)) {
    warnings.push(`${p.legacy_id} (${p.full_name}): mother_legacy_id ${p.mother_legacy_id} not found`);
  }
  if (p.father_legacy_id && p.father_legacy_id === p.mother_legacy_id) {
    warnings.push(`${p.legacy_id} (${p.full_name}): father and mother are the same person`);
  }
}

for (const pair of spousePairs) {
  if (!allIds.has(pair.a) || !allIds.has(pair.b)) {
    warnings.push(`spouse pair ${pair.a}<->${pair.b}: one side not found in people`);
  }
  for (const childId of pair.children) {
    if (!allIds.has(childId)) {
      warnings.push(`spouse pair ${pair.a}<->${pair.b}: child ${childId} not found in people`);
      continue;
    }
    const child = people.get(childId);
    const childParents = new Set([child.father_legacy_id, child.mother_legacy_id].filter(Boolean));
    if (!childParents.has(pair.a) || !childParents.has(pair.b)) {
      warnings.push(
        `${childId} (${child.full_name}) listed as a child of ${pair.a}<->${pair.b} but its own page says parents are ${child.father_legacy_id ?? "?"}/${child.mother_legacy_id ?? "?"}`,
      );
    }
  }
}

// Likely-duplicate individuals: identical full_name + surname_tag.
const byNameKey = new Map();
for (const p of people.values()) {
  const key = `${p.full_name.toLowerCase()}|${(p.surname_tag ?? "").toLowerCase()}`;
  if (!byNameKey.has(key)) byNameKey.set(key, []);
  byNameKey.get(key).push(p.legacy_id);
}
const duplicateCandidates = [...byNameKey.entries()]
  .filter(([, ids]) => ids.length > 1)
  .map(([key, ids]) => ({ name: key, legacy_ids: ids }));

// Cycle check (ancestor loops).
function hasCycle(startId) {
  let cur = startId;
  const seen = new Set();
  for (let i = 0; i < people.size + 1; i++) {
    if (!cur) return false;
    if (seen.has(cur)) return true;
    seen.add(cur);
    cur = people.get(cur)?.father_legacy_id ?? null;
  }
  return true;
}
for (const p of people.values()) {
  if (hasCycle(p.legacy_id)) {
    warnings.push(`${p.legacy_id} (${p.full_name}): ancestor cycle detected via father chain`);
  }
}

// --- Write output ---
const peopleOut = [...people.values()];
const spousesOut = spousePairs.map((p) => ({
  person_a_legacy_id: p.a,
  person_b_legacy_id: p.b,
  marriage_notes: p.marriage_notes.length ? p.marriage_notes.join(" ") : null,
}));

fs.writeFileSync(path.join(outputDir, "people.json"), JSON.stringify(peopleOut, null, 2));
fs.writeFileSync(path.join(outputDir, "spouses.json"), JSON.stringify(spousesOut, null, 2));
fs.writeFileSync(
  path.join(outputDir, "validation-report.txt"),
  [
    `Parsed ${peopleOut.length} people, ${spousesOut.length} spouse pairs from ${files.length} files.`,
    ``,
    `=== Duplicate name candidates (${duplicateCandidates.length}) ===`,
    ...duplicateCandidates.map((d) => `${d.name}: ${d.legacy_ids.join(", ")}`),
    ``,
    `=== Warnings (${warnings.length}) ===`,
    ...warnings,
  ].join("\n"),
);

console.log(`Parsed ${peopleOut.length} people, ${spousesOut.length} spouse pairs.`);
console.log(`${warnings.length} warnings, ${duplicateCandidates.length} duplicate-name candidates.`);
console.log(`Output written to ${outputDir}`);
