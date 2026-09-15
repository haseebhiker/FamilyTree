export const TIPS: string[] = [
  "Enter your preferred name under “Edit profile” — it's what shows first, in bold, everywhere your name appears (including the tree).",
  "Use the 🔍 search icon in the top nav to jump straight to anyone by name, from any page.",
  "Know someone's mother or father is already in the tree? Open their profile, go to “Add a family member,” pick Parent, and search for the existing person instead of creating a duplicate.",
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
  "Use the “Compare” tool to see how any two family members — not just you — are related to each other.",
  "Keep the family connected — add your mobile phone number to your profile so relatives can reach out.",
  "Notice a missing date or name on someone's profile? Click “Suggest an edit” to help fill it in.",
];

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * A new tip each time you sign in, not each page load — driven by the
 * member's own last_login_at (already updated on every sign-in, stable
 * across page loads within that session) rather than a client-side
 * random pick or a calendar day shared by everyone.
 */
export function getTip(seed: string): string {
  return TIPS[hashString(seed) % TIPS.length];
}
