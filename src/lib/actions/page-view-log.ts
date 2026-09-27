"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";

/**
 * Called from PageViewTracker's useEffect — fires only once a page has
 * actually mounted in someone's browser, not on Next.js's own <Link>
 * prefetching (which was the problem with logging this from middleware
 * instead: prefetch fires a real request the instant a link merely
 * renders, e.g. opening the nav dropdown "visited" every link inside it).
 */
export async function recordPageView(path: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const member = await getCurrentMember(supabase, user.id);
  if (!member) return;

  // No .select() — see the comment on the login_log insert in
  // auth/callback/route.ts for why that would make a non-admin's own
  // insert look like it failed even when it succeeded.
  await supabase.from("page_view_log").insert({ member_id: member.id, path });

  // No automatic expiry — kept indefinitely until an admin clears it from
  // the Activity Log page (which lets them pick a cutoff date, rather than
  // only ever wiping the whole thing at once).
}

/**
 * Deletes activity logged on or before the chosen date (inclusive) — not
 * necessarily the whole log. Called directly from ClearActivityLogForm (not
 * a bare `<form action>`), which does its own router.refresh() after
 * success — see ActionButton's comment for why bundling a revalidatePath
 * into this action's own response was the repeated source of "Minified
 * React error #441" crashes elsewhere in this app.
 */
export async function clearPageViewLog(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const member = await getCurrentMember(supabase, user.id);
  if (!isAdmin(member)) throw new Error("Admins only");

  const upToDate = String(formData.get("up_to") ?? "").trim();
  if (!upToDate) throw new Error("Pick a date to clear up to");

  // End of that UTC calendar day, so the picked day itself is fully
  // included — not worth threading the admin's own timezone through for
  // what's just a manual housekeeping action.
  const cutoff = new Date(`${upToDate}T23:59:59.999Z`);
  if (Number.isNaN(cutoff.getTime())) throw new Error("Invalid date");

  const { error } = await supabase.from("page_view_log").delete().lte("viewed_at", cutoff.toISOString());
  if (error) throw new Error(error.message);
}
