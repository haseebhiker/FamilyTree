const RELATION_WORD: Record<string, Record<string, string>> = {
  child: { M: "son", F: "daughter" },
  parent: { M: "father", F: "mother" },
  sibling: { M: "brother", F: "sister" },
  spouse: { M: "husband", F: "wife" },
};

interface PersonLite {
  id: string;
  full_name: string;
  preferred_name?: string | null;
  surname_tag: string | null;
}

/**
 * A plain-English description of what an audit_log row (or a pending
 * change, before it's applied — same shape either way: a change_type plus
 * the data it carries) actually did — for edit_person, a field-by-field
 * "field: old → new" list; for the relationship-shaped types, the same
 * one-sentence summary already used on the Pending Approvals page.
 */
export function describeChange(
  changeType: string,
  data: Record<string, unknown> | null,
  targetPersonId: string | null,
  previousData: Record<string, unknown> | null,
  peopleById: Map<string, PersonLite>,
): string {
  const d = data ?? {};
  const nameOf = (id: unknown) =>
    typeof id === "string" ? (peopleById.get(id)?.full_name ?? "someone not in the tree") : "someone not in the tree";

  if (changeType === "edit_person") {
    const keys = Object.keys(d);
    if (keys.length === 0) return "No fields changed.";
    return keys
      .map((k) => {
        const from = previousData?.[k];
        const to = d[k];
        const fromText = from == null || from === "" ? "empty" : String(from);
        const toText = to == null || to === "" ? "empty" : String(to);
        return `${k.replace(/_/g, " ")}: ${fromText} → ${toText}`;
      })
      .join("; ");
  }

  if (changeType === "add_person") {
    const relationType = String(d.relation_type ?? "");
    const word = RELATION_WORD[relationType]?.[String(d.gender ?? "")] ?? (relationType || "relative");
    const withOther = typeof d.other_parent_id === "string" ? ` (also recorded as ${nameOf(d.other_parent_id)}'s child)` : "";
    return `Added a new person, ${d.full_name ?? "(unnamed)"}, as ${nameOf(d.relation_to_person_id)}'s ${word}${withOther}.`;
  }

  if (changeType === "add_relationship") {
    if (d.mode === "sibling") {
      return `Made ${nameOf(targetPersonId)} a sibling of ${nameOf(d.relation_to_person_id)} (same parents).`;
    }
    if (d.mode === "spouse") {
      return `Added ${nameOf(d.existing_person_id)} as ${nameOf(d.relation_to_person_id)}'s spouse.`;
    }
    return `Linked ${nameOf(d.existing_person_id)} as a parent of ${nameOf(targetPersonId)}.`;
  }

  if (changeType === "propose_deletion") {
    return `Removed ${nameOf(targetPersonId)}'s profile from the tree.`;
  }

  return changeType.replace(/_/g, " ");
}

/** Every person id an audit_log row's data could reference, beyond its own person_id — for batching one lookup query instead of one per row. */
export function referencedPersonIds(data: Record<string, unknown> | null): string[] {
  const d = data ?? {};
  return [d.relation_to_person_id, d.existing_person_id, d.other_parent_id]
    .filter((v): v is string => typeof v === "string");
}
