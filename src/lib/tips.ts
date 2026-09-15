export const TIPS: string[] = [
  "Enter your preferred name under “Edit profile” — it's what shows first, in bold, everywhere your name appears (including the tree).",
  "Can't find someone in a list of 1000+ names? Use the search box at the top of the Tree page.",
  "Know someone's mother or father is already in the tree? Open their profile, go to “Add a family member,” and use “Or link someone already in the tree” instead of creating a duplicate.",
  "Control who sees your details: open “Privacy settings” on your profile to choose Everyone, a specific group, or just you — for each field.",
  "Everyone can suggest an edit to any profile. Admins review and approve it, or apply it instantly if they're the one submitting.",
  "Check “My Submissions” (under the More menu) to see the status of edits you've suggested.",
  "Add this app to your phone's home screen for one-tap access — see “Install App” under the More menu.",
  "The WhatsApp, Call, and Text icons on a profile use that person's number formatted for their own country automatically.",
  "Calling someone from the app? You'll be asked to confirm first — handy since many of us are on international numbers.",
  "Groups let you share extra details (like a phone number) with just a subset of the family, not everyone.",
  "Only birth/death years are required — you can leave the month or day blank if you don't know them.",
  "Admins: the Audit Log tracks every change forever until cleared; the Login Log auto-clears after 30 days.",
];

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((today - start) / 86_400_000);
}

/** Same tip for everyone on a given calendar day (UTC), rotating through the list. */
export function getTipOfTheDay(): string {
  return TIPS[dayOfYear(new Date()) % TIPS.length];
}
