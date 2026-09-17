interface WithBirth {
  full_name: string;
  birth_year?: number | null;
  birth_month?: number | null;
  birth_day?: number | null;
  birth_order?: number | null;
}

/**
 * Eldest first, wherever birth dates are known. A missing month/day just
 * drops out of the comparison key (treated as earliest-in-that-year rather
 * than skipped), so "born 1980" still sorts correctly against "born March
 * 1980" or "born March 3 1980" — the coarser date is presumed older only
 * because there's no finer information to place it otherwise. Anyone with
 * no birth year at all sorts after everyone whose age is known (there's no
 * basis to place them by age) — among that group, birth_order (1st child,
 * 2nd child, ...) breaks the tie when given, since it's still real
 * information about relative age even without an exact date; someone with
 * a birth_order sorts ahead of a sibling with neither, and only when both
 * are missing entirely does it fall back to alphabetical.
 */
export function sortByAge<T extends WithBirth>(people: T[]): T[] {
  return [...people].sort((a, b) => {
    const aKnown = a.birth_year != null;
    const bKnown = b.birth_year != null;
    if (aKnown && bKnown) {
      const aKey = a.birth_year! * 10000 + (a.birth_month ?? 0) * 100 + (a.birth_day ?? 0);
      const bKey = b.birth_year! * 10000 + (b.birth_month ?? 0) * 100 + (b.birth_day ?? 0);
      if (aKey !== bKey) return aKey - bKey;
    } else if (aKnown !== bKnown) {
      return aKnown ? -1 : 1;
    } else {
      const aOrder = a.birth_order ?? null;
      const bOrder = b.birth_order ?? null;
      if (aOrder != null && bOrder != null) {
        if (aOrder !== bOrder) return aOrder - bOrder;
      } else if (aOrder != null || bOrder != null) {
        return aOrder != null ? -1 : 1;
      }
    }
    return a.full_name.localeCompare(b.full_name);
  });
}

/**
 * Sibling-specific ordering, per pair rather than sortByAge's whole-set
 * "does everyone have a year" gate — that scattered a sibling set to
 * alphabetical (by full legal name, not the preferred name actually shown)
 * the moment even ONE sibling lacked a year, discarding perfectly good
 * birth_year data for everyone else in the set. Confirmed live: an
 * 11-sibling set with 10 recorded years still sorted alphabetically because
 * the 11th had neither a year nor a birth_order.
 *
 * Per pair: prefer birth_order when BOTH have one (it directly encodes
 * position within this specific sibling set); otherwise fall back to
 * birth_year for that pair. Anyone with neither piece of data sorts after
 * everyone who has at least one, same convention as sortByAge, rather than
 * landing wherever alphabetical happens to place them relative to dated
 * siblings.
 */
export function sortSiblings<T extends WithBirth>(people: T[]): T[] {
  return [...people].sort((a, b) => {
    const aHasData = a.birth_order != null || a.birth_year != null;
    const bHasData = b.birth_order != null || b.birth_year != null;
    if (aHasData !== bHasData) return aHasData ? -1 : 1;

    const aOrder = a.birth_order ?? null;
    const bOrder = b.birth_order ?? null;
    if (aOrder != null && bOrder != null) {
      if (aOrder !== bOrder) return aOrder - bOrder;
    } else {
      const aYear = a.birth_year ?? null;
      const bYear = b.birth_year ?? null;
      if (aYear != null && bYear != null) {
        const aKey = aYear * 10000 + (a.birth_month ?? 0) * 100 + (a.birth_day ?? 0);
        const bKey = bYear * 10000 + (b.birth_month ?? 0) * 100 + (b.birth_day ?? 0);
        if (aKey !== bKey) return aKey - bKey;
      } else if (aOrder != null || bOrder != null) {
        return aOrder != null ? -1 : 1;
      }
    }
    return a.full_name.localeCompare(b.full_name);
  });
}
