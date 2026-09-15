"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";

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
