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

/** Visual label used everywhere a person's name is shown: preferred name leads in bold (what people actually go by), followed by the full formal name from the original tree. */
export function PersonName({ person }: { person: NameFields }) {
  if (!person.preferred_name) return <>{formalName(person)}</>;
  return (
    <>
      <span className="font-semibold">{person.preferred_name}</span> {formalName(person)}
    </>
  );
}
