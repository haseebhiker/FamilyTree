"use server";

import { revalidatePath } from "next/cache";
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

  // Rolling 7-day retention, same opportunistic-delete-on-insert pattern as
  // login_log — probabilistic here since page views are far more frequent
  // than sign-ins, so most calls skip the extra query.
  if (Math.random() < 0.02) {
    await supabase.from("page_view_log").delete().lt("viewed_at", new Date(Date.now() - 7 * 86400000).toISOString());
  }
}

export async function clearPageViewLog() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const member = await getCurrentMember(supabase, user.id);
  if (!isAdmin(member)) throw new Error("Admins only");

  // Every row matches this condition (id is never null) — admin-only RLS
  // policy is what actually allows wiping non-expired rows too.
  const { error } = await supabase.from("page_view_log").delete().not("id", "is", null);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/activity-log");
}
