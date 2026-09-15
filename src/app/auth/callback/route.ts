import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { provisionMemberFromInvite } from "@/lib/members";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) console.error("[auth/callback] exchangeCodeForSession failed:", error.message, error);

    if (!error && data.user) {
      // Reverted to the cheap read-first path (provisionMemberFromInvite)
      // instead of always calling accept_invite(): that RPC's upsert sets
      // person_id = the INVITE's own person_id unconditionally on every
      // call, including for an EXISTING member on a routine returning
      // sign-in. An invite's person_id is normally only ever set at invite
      // creation — linking someone to their tree profile LATER (the
      // "Linked profile" flow in Invite Management, linkMemberToPerson)
      // only updates the members row, never the original invite. So
      // calling accept_invite() on every login was silently WIPING
      // person_id back to null for anyone linked after the fact, on their
      // very next sign-in. Confirmed this happened to a real account.
      // The last_login_at freshness this was fixing needs a different
      // approach — one that doesn't re-run accept_invite()'s full upsert
      // on every login — see the pending fix to accept_invite() itself.
      const member = await provisionMemberFromInvite(supabase, data.user);

      if (member) {
        // Recorded on every sign-in, not just the first — see
        // supabase/schema.sql for how the 30-day retention is enforced.
        await supabase.from("login_log").insert({ member_id: member.id, email: member.email });
        await supabase.from("login_log").delete().lt("logged_in_at", new Date(Date.now() - 30 * 86400000).toISOString());
        return NextResponse.redirect(`${origin}/`);
      }

      return NextResponse.redirect(`${origin}/not-authorized`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Sign-in failed. Please try again.")}`,
  );
}
