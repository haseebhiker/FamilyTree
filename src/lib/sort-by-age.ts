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
