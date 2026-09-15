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
