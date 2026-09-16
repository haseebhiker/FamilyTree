// General tips — shown to every member. Skew toward "selling" the features
// that make the tree more useful and complete (comparing relationships,
// contact info, preferred names, filling in gaps) rather than just
// explaining mechanics, since encouraging participation is the actual goal.
const TIPS: string[] = [
  "Enter your preferred name under “Edit profile” — it's what shows first, in bold, everywhere your name appears (including the tree).",
  "Use the 🔍 search icon in the top nav to jump straight to anyone by name, from any page.",
  "Know someone's mother or father is already in the tree? Open their profile, go to “Add a family member,” pick Parent, and search for the existing person instead of creating a duplicate.",
  "Notice someone missing from the family tree entirely? Open their closest relative's profile and use “Add a family member” to add them.",
  "Check “My Submissions” (in the ☰ menu) to see the status of edits you've suggested.",
  "Add this app to your phone's home screen for one-tap access — see “Install App” in the ☰ menu.",
  "The WhatsApp, Call, and Text icons on a profile use that person's number formatted for their own country automatically.",
  "Calling someone from the app? You'll be asked to confirm first — handy since many of us are on international numbers.",
  "Groups let you share extra details (like a phone number) with just a subset of the family, not everyone.",
  "Only birth/death years are required — you can leave the month or day blank if you don't know them.",
  "Curious how you're related to someone? Open their profile and click “How you're related” to see every connection between you.",
  "Want to know how two OTHER family members are related to each other? Use “Compare” (top nav) to check any two people, not just yourself.",
  "Setting someone's gender on their profile helps the app say “son” or “aunt” correctly instead of a generic term.",
  "Have a question about how the app works? Check the FAQ in the ☰ menu.",
  "Add your mobile number to your profile so relatives can reach you on WhatsApp or by text, right from your profile page.",
  "See a name, date, or detail that's wrong or missing on someone's profile? Click “Suggest an edit” — it only takes a moment.",
  "Enter at least the year someone was born, even if you don't know the month or day — it's what lets Children, Siblings, and Cousins sort oldest to youngest instead of alphabetically.",
  "On “How you're related,” click directly on a relationship line (like “your wife's 1st cousin”) to expand it and see the exact chain of people connecting you.",
];

// Mixed in only for admins — irrelevant (and a bit confusing) to everyone else.
const ADMIN_TIPS: string[] = [
  "Admins: the Audit Log tracks every change forever until cleared; the Login Log auto-clears after 30 days.",
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
export function getTip(seed: string, isAdmin: boolean): string {
  const pool = isAdmin ? [...TIPS, ...ADMIN_TIPS] : TIPS;
  return pool[hashString(seed) % pool.length];
}
