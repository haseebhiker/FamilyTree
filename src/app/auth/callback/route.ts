import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) console.error("[auth/callback] exchangeCodeForSession failed:", error.message, error);

    if (!error && data.user) {
      // Always the accept_invite() RPC directly here, not the cheap
      // read-first provisionMemberFromInvite path used by the
      // per-navigation middleware: this route only fires on an actual sign-in,
      // so the extra round trip doesn't matter, and the RPC's own upsert is
      // what refreshes last_login_at — the plain read used elsewhere never
      // touches it, which is why it used to only ever reflect someone's
      // very first sign-in and go stale after that. Also a members-table
      // update would need the RPC's elevated privilege anyway: a
      // non-admin's own plain client update to their own row is blocked
      // by RLS (only admins can update members directly).
      const { data: member } = await supabase.rpc("accept_invite");

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
