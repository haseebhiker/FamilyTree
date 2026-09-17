interface NameFields {
  full_name: string;
  surname_tag: string | null;
  preferred_name?: string | null;
}

export function formalName(p: Pick<NameFields, "full_name" | "surname_tag">) {
  return p.surname_tag ? `${p.full_name} /${p.surname_tag}/` : p.full_name;
}

/** Plain-text version, for search matching, aria-labels, etc. */
export function displayNameText(p: NameFields) {
  return p.preferred_name ? `${p.preferred_name} ${formalName(p)}` : formalName(p);
}

/**
 * Preferred name ONLY when set, falling back to the full formal name
 * otherwise — unlike PersonName, which always shows both. Scoped to the
 * tree/chart view and the relationship lists (Children/Siblings/Cousins)
 * that explicitly asked for the same rule; profile headers, search, and
 * everywhere else keep showing both via PersonName.
 */
export function TreeName({ person }: { person: NameFields }) {
  return <>{person.preferred_name || formalName(person)}</>;
}

/** Visual label used everywhere a person's name is shown: preferred name leads in bold (what people actually go by), followed by the full formal name from the original tree — each part its own color so the three are easy to tell apart at a glance. */
export function PersonName({ person }: { person: NameFields }) {
  return (
    <>
      {person.preferred_name && (
        <>
          <span className="font-semibold text-blue-700">{person.preferred_name}</span>{" "}
        </>
      )}
      <span className="text-slate-700">{person.full_name}</span>
      {person.surname_tag && <span className="text-amber-700"> /{person.surname_tag}/</span>}
    </>
  );
}

/**
 * Preferred-name-only (TreeName) on a narrow/mobile-width screen, the full
 * PersonName on a wider one — desktop has the room to show both names
 * comfortably, phones don't. CSS-only (both versions render; a media
 * query shows/hides each), not real device detection: this is a Server
 * Component-friendly way to make this responsive without needing to know
 * what device actually requested the page, and it reacts correctly even
 * if someone resizes a desktop browser narrow.
 */
export function ResponsivePersonName({ person }: { person: NameFields }) {
  return (
    <>
      <span className="sm:hidden">
        <TreeName person={person} />
      </span>
      <span className="hidden sm:inline">
        <PersonName person={person} />
      </span>
    </>
  );
}
