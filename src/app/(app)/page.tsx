import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/members";

/** Signing in should land you on your own page, not a site-wide tree with 1000+ names — the full Tree is one click away in the nav. Falls back there only if your account isn't linked to a profile yet. */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMember(supabase, user!.id);

  redirect(member?.person_id ? `/people/${member.person_id}` : "/tree");
}
