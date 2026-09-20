import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The message pre-typed into WhatsApp when a member taps "Ask Haseeb":
 * "Hi Haseeb, I am <their name in the family tree> (#<their person number>). ..."
 * so Haseeb knows exactly who's writing without asking. Falls back to the
 * account name if the member isn't linked to a profile yet.
 */
export async function askHaseebMessage(
  supabase: SupabaseClient,
  member: { name: string; person_id: string | null },
  ending = "I have a question about the family tree: ",
): Promise<string> {
  let name = member.name;
  let number: number | null = null;
  if (member.person_id) {
    const { data } = await supabase.from("people").select("full_name, public_no").eq("id", member.person_id).maybeSingle();
    if (data?.full_name) name = data.full_name;
    number = data?.public_no ?? null;
  }
  return `Hi Haseeb, I am ${name.trim()}${number ? ` (#${number})` : ""}. ${ending}`;
}
