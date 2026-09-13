export interface PartialDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Formats a partial date (any of year/month/day may be missing — e.g.
 * "just a year", "month and day but no year") the way a person would
 * naturally say it. Returns null when nothing is known at all.
 */
export function formatPartialDate({ year, month, day }: PartialDate): string | null {
  if (!year && !month && !day) return null;
  const monthName = month ? MONTH_NAMES[month - 1] : null;

  if (year && month && day) return `${monthName} ${day}, ${year}`;
  if (year && month) return `${monthName} ${year}`;
  if (year) return `${year}`;
  if (month && day) return `${monthName} ${day} (year unknown)`;
  if (month) return `${monthName} (year unknown)`;
  return null;
}

/** Parses year/month/day form fields (strings, possibly empty) into a PartialDate, validating ranges. */
export function parsePartialDateFields(
  yearRaw: FormDataEntryValue | null,
  monthRaw: FormDataEntryValue | null,
  dayRaw: FormDataEntryValue | null,
): PartialDate {
  const year = yearRaw ? parseInt(String(yearRaw), 10) : null;
  const month = monthRaw ? parseInt(String(monthRaw), 10) : null;
  const day = dayRaw ? parseInt(String(dayRaw), 10) : null;

  if (year !== null && (Number.isNaN(year) || year < 1000 || year > 2200)) {
    throw new Error("Year looks invalid");
  }
  if (month !== null && (Number.isNaN(month) || month < 1 || month > 12)) {
    throw new Error("Month must be between 1 and 12");
  }
  if (day !== null && (Number.isNaN(day) || day < 1 || day > 31)) {
    throw new Error("Day must be between 1 and 31");
  }
  if (day !== null && month === null) {
    throw new Error("A day needs a month too");
  }

  return { year, month, day };
}
