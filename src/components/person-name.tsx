interface NameFields {
  full_name: string;
  surname_tag: string | null;
  preferred_name?: string | null;
}

export function formalName(p: Pick<NameFields, "full_name" | "surname_tag">) {
  // No slashes: "Given /CLAN/" was Legacy Family Tree's GEDCOM encoding, where
  // the delimiters existed only because the surname had no field of its own.
  // It does here (surname_tag), so the slashes carry no information and
  // nobody writes their name that way.
  return p.surname_tag ? `${p.full_name} ${p.surname_tag}` : p.full_name;
}

/**
 * What to call someone: their preferred name if they've set one, otherwise
 * the name from the original tree. The preferred name REPLACES the formal
 * one rather than preceding it — someone who goes by "Chote" is shown as
 * Chote, not "Chote MohamedYoonus".
 */
export function displayName(p: NameFields) {
  return p.preferred_name?.trim() || p.full_name;
}

/** Plain-text label — the visible name plus the family name, for aria-labels and one-line summaries. */
export function displayNameText(p: NameFields) {
  return p.surname_tag ? `${displayName(p)} ${p.surname_tag}` : displayName(p);
}

/**
 * Everything a person could reasonably be searched by, including the formal
 * name even when a preferred name has replaced it on screen. Without this,
 * setting a preferred name would make someone unfindable by the name they
 * appear under in the original tree — which is exactly the name a relative
 * looking for them is most likely to type.
 */
export function searchText(p: NameFields) {
  return [p.preferred_name, p.full_name, p.surname_tag].filter(Boolean).join(" ");
}

/**
 * Visual label used everywhere a person's name is shown, stacked on two lines:
 *
 *     Preferred-or-formal name
 *     FAMILY NAME
 *
 * Sized in `em`, not a fixed `text-*` step, so one component works everywhere
 * it's used — 0.6em of a 2xl page heading and 0.6em of a dense list row both
 * land in proportion, with no per-caller overrides.
 *
 * `inline-flex` (not `block`) keeps it legal inside the headings, links, and
 * table cells that already wrap it.
 */
export function PersonName({ person }: { person: NameFields }) {
  return (
    <span className="inline-flex flex-col align-top leading-tight">
      {/* Preferred and formal names render identically. The preferred name
          isn't an annotation on the "real" one — it IS the name, so styling
          it differently would flag a distinction the reader doesn't need. */}
      <span className="text-slate-700">{displayName(person)}</span>
      {person.surname_tag && (
        <span className="text-[0.6em] font-medium tracking-wide text-amber-700">
          {person.surname_tag}
        </span>
      )}
    </span>
  );
}

/**
 * TreeName and ResponsivePersonName both now render PersonName.
 *
 * They were introduced to give the tree, the Ancestors chart and the Family
 * lists a preferred-name-only label while profile headers kept showing
 * "preferred + formal /CLAN/", with ResponsivePersonName switching between
 * the two at the `sm` breakpoint. PersonName itself now follows the
 * preferred-name-only rule everywhere and puts the family name on its own
 * line, so there is no second style left to switch to — keeping them as
 * aliases avoids churning every call site in this change.
 */
export const TreeName = PersonName;
export const ResponsivePersonName = PersonName;

/**
 * Preferred name in blue, followed by the full name, surname tag inline
 * right after (not stacked on its own line) — for contexts where telling
 * apart several similarly-named people matters more than a short, tidy
 * label: admin screens, pickers, and lists where the action taken depends
 * on picking the right specific person (approving a change, linking an
 * account, removing someone from a group). Everywhere else keeps
 * PersonName's preferred-replaces-full behavior.
 */
export function DisambiguatedName({ person }: { person: NameFields }) {
  const preferred = person.preferred_name?.trim();
  return (
    <span>
      {preferred && <span className="font-semibold text-blue-700">{preferred} </span>}
      <span>{person.full_name}</span>
      {person.surname_tag && (
        <span className="ml-1 text-[0.7rem] font-medium tracking-wide text-amber-700">{person.surname_tag}</span>
      )}
    </span>
  );
}

/**
 * Profile page header only: preferred name in blue, followed by the full
 * name, on one line — the pre-redesign look Haseeb asked to keep just here.
 * Surname tag still gets its own line below, styled exactly like PersonName.
 */
export function ProfileHeaderName({ person }: { person: NameFields }) {
  return (
    <span className="inline-flex flex-col align-top leading-tight">
      <span>
        {person.preferred_name?.trim() && (
          <span className="font-semibold text-blue-700">{person.preferred_name}</span>
        )}
        {person.preferred_name?.trim() && " "}
        <span className="text-slate-700">{person.full_name}</span>
      </span>
      {person.surname_tag && (
        <span className="text-[0.6em] font-medium tracking-wide text-amber-700">
          {person.surname_tag}
        </span>
      )}
    </span>
  );
}
