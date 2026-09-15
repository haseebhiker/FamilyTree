export const TIPS: string[] = [
  "Enter your preferred name under “Edit profile” — it's what shows first, in bold, everywhere your name appears (including the tree).",
  "Use the 🔍 search icon in the top nav to jump straight to anyone by name, from any page.",
  "Know someone's mother or father is already in the tree? Open their profile, go to “Add a family member,” pick Parent, and search for the existing person instead of creating a duplicate.",
  "Control who sees your details: open “My Privacy Settings” (in the ☰ menu) to choose Everyone, a specific group, or just you — for each field.",
  "Everyone can suggest an edit to any profile. Admins review and approve it, or apply it instantly if they're the one submitting.",
  "Check “My Submissions” (in the ☰ menu) to see the status of edits you've suggested.",
  "Add this app to your phone's home screen for one-tap access — see “Install App” in the ☰ menu.",
  "The WhatsApp, Call, and Text icons on a profile use that person's number formatted for their own country automatically.",
  "Calling someone from the app? You'll be asked to confirm first — handy since many of us are on international numbers.",
  "Groups let you share extra details (like a phone number) with just a subset of the family, not everyone.",
  "Only birth/death years are required — you can leave the month or day blank if you don't know them.",
  "Admins: the Audit Log tracks every change forever until cleared; the Login Log auto-clears after 30 days.",
  "Open any profile and click “How you're related” to see every way you're connected to that person.",
  "Setting someone's gender on their profile helps the app say “son” or “aunt” correctly instead of a generic term.",
  "Have a question about how the app works? Check the FAQ in the ☰ menu.",
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
