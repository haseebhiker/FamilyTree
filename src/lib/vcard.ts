/**
 * A small vCard (.vcf) reader for the contact import — runs in the browser, so
 * a contacts file never leaves the admin's device until they choose what to
 * save. Handles what iCloud and Google Contacts export (vCard 3.0/4.0, folded
 * lines, "item1." groups, TYPE=... or bare CELL/HOME/WORK parameters) plus
 * the quoted-printable encoding older Android exports use.
 */

export interface ContactValue {
  value: string;
  label: string;
}

export interface ParsedContact {
  name: string;
  org: string | null;
  /** Job title, nickname and a short note, when the contact has them — context for deciding who someone is. */
  title?: string | null;
  nickname?: string | null;
  note?: string | null;
  phones: ContactValue[];
  emails: ContactValue[];
}

function unfold(text: string): string[] {
  const raw = text.replace(/\r\n|\r/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i];
    // RFC folding: a line starting with a space/tab continues the previous one.
    while (i + 1 < raw.length && /^[ \t]/.test(raw[i + 1])) {
      line += raw[i + 1].slice(1);
      i++;
    }
    // vCard 2.1 quoted-printable soft breaks: a trailing "=" continues the value.
    while (/quoted-printable/i.test(line) && line.endsWith("=") && i + 1 < raw.length) {
      line = line.slice(0, -1) + raw[i + 1];
      i++;
    }
    out.push(line);
  }
  return out;
}

function decodeQuotedPrintable(value: string): string {
  try {
    const bytes = value.replace(/=([0-9A-Fa-f]{2})/g, "%$1");
    return decodeURIComponent(bytes);
  } catch {
    return value;
  }
}

function unescapeValue(value: string): string {
  return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

function firstUnquotedColon(line: string): number {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === ":" && !inQuotes) return i;
  }
  return -1;
}

function phoneLabel(types: string[]): string {
  if (types.some((t) => t === "home")) return "Home";
  if (types.some((t) => t === "work" || t === "office")) return "Work";
  return "Mobile";
}

function emailLabel(types: string[]): string {
  return types.some((t) => t === "work" || t === "office") ? "Work" : "Personal";
}

export function parseVCards(text: string): ParsedContact[] {
  const contacts: ParsedContact[] = [];
  let current: (ParsedContact & { fn: string; n: string }) | null = null;
  const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

  for (const line of unfold(text)) {
    if (!line.trim()) continue;
    if (/^BEGIN:VCARD/i.test(line)) {
      current = { name: "", org: null, title: null, nickname: null, note: null, phones: [], emails: [], fn: "", n: "" };
      continue;
    }
    if (/^END:VCARD/i.test(line)) {
      if (current) {
        // Some exports keep only a first name in FN but the full name in N (or the reverse): take whichever has more words.
        const name = (words(current.n) > words(current.fn) ? current.n : current.fn) || current.n || current.org || "";
        if (name && (current.phones.length > 0 || current.emails.length > 0)) {
          contacts.push({
            name,
            org: current.org,
            title: current.title,
            nickname: current.nickname,
            note: current.note,
            phones: current.phones,
            emails: current.emails,
          });
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = firstUnquotedColon(line);
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    let value = line.slice(colon + 1);
    const parts = head.split(";");
    const prop = parts[0].replace(/^[^.]*\./, "").toUpperCase(); // drop "item1." group prefix
    const params = parts.slice(1).map((p) => p.trim());
    const types: string[] = [];
    let quotedPrintable = false;
    for (const p of params) {
      const lower = p.toLowerCase();
      if (lower.startsWith("encoding=") && lower.includes("quoted-printable")) quotedPrintable = true;
      else if (lower === "quoted-printable") quotedPrintable = true;
      else if (lower.startsWith("type=")) types.push(...lower.slice(5).replace(/"/g, "").split(","));
      else if (!lower.includes("=")) types.push(lower);
    }
    if (quotedPrintable) value = decodeQuotedPrintable(value);

    if (prop === "FN") current.fn = unescapeValue(value);
    else if (prop === "N") {
      const [family = "", given = "", additional = ""] = value.split(";").map(unescapeValue);
      current.n = [given, additional, family].filter(Boolean).join(" ");
    } else if (prop === "ORG") current.org = unescapeValue(value.split(";")[0]) || null;
    else if (prop === "TITLE") current.title = unescapeValue(value) || null;
    else if (prop === "NICKNAME") current.nickname = unescapeValue(value) || null;
    else if (prop === "NOTE") current.note = unescapeValue(value).replace(/\s+/g, " ").slice(0, 120) || null;
    else if (prop === "TEL") {
      const v = unescapeValue(value).replace(/^tel:/i, "");
      if (v) current.phones.push({ value: v, label: phoneLabel(types) });
    } else if (prop === "EMAIL") {
      const v = unescapeValue(value);
      if (v) current.emails.push({ value: v, label: emailLabel(types) });
    }
  }
  return contacts;
}
