"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";

export async function clearAuditLog() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const member = await getCurrentMember(supabase, user.id);
  if (!isAdmin(member)) throw new Error("Admins only");

  const { error } = await supabase.from("audit_log").delete().not("id", "is", null);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/audit-log");
}
