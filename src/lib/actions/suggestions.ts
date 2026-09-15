"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";

async function requireMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const member = await getCurrentMember(supabase, user.id);
  if (!member) throw new Error("Not authorized");
  return { supabase, member };
}

export async function submitSuggestion(formData: FormData) {
  const { supabase, member } = await requireMember();

  const message = String(formData.get("message") ?? "").trim();
  if (!message) throw new Error("Please enter a suggestion");

  const { error } = await supabase.from("suggestions").insert({
    member_id: member.id,
    message,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/suggestions");
}

export async function updateSuggestionStatus(formData: FormData) {
  const { supabase, member } = await requireMember();
  if (!isAdmin(member)) throw new Error("Admins only");

  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!id || !["open", "reviewed", "done"].includes(status)) throw new Error("Invalid update");

  const { error } = await supabase.from("suggestions").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/suggestions");
}
