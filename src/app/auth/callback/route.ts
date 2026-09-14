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
      const member = await provisionMemberFromInvite(supabase, data.user);

      if (member) {
        return NextResponse.redirect(`${origin}/`);
      }

      return NextResponse.redirect(`${origin}/not-authorized`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Sign-in failed. Please try again.")}`,
  );
}
