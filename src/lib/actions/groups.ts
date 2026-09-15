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

export async function createGroup(formData: FormData) {
  const { supabase } = await requireMember();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");
  const description = String(formData.get("description") ?? "").trim() || null;
  const isPublic = formData.get("is_public") === "on";

  const { error } = await supabase.rpc("create_group", {
    p_name: name,
    p_description: description,
    p_is_public: isPublic,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/groups");
}

// A group's creator or an app admin curates who's tagged into it — this is
// recording a fact about the family tree (who's part of this branch), not
// a self-service membership, so there's no join/approve workflow.
async function requireGroupCurator(groupId: string) {
  const { supabase, member } = await requireMember();
  if (isAdmin(member)) return { supabase, member };
  const { data: group } = await supabase.from("groups").select("created_by").eq("id", groupId).maybeSingle();
  if (group?.created_by !== member.id) throw new Error("Only this group's creator or an app admin can do that");
  return { supabase, member };
}

export async function addPersonToGroup(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "");
  const personId = String(formData.get("person_id") ?? "");
  if (!groupId || !personId) throw new Error("Choose a person to add");
  const { supabase, member } = await requireGroupCurator(groupId);

  const { data: person } = await supabase.from("people").select("full_name").eq("id", personId).maybeSingle();
  if (!person) throw new Error("Person not found");

  const { data: existing } = await supabase
    .from("group_people")
    .select("id")
    .eq("group_id", groupId)
    .eq("person_id", personId)
    .maybeSingle();
  if (existing) throw new Error(`${person.full_name} is already tagged in this group`);

  const { error } = await supabase.from("group_people").insert({
    group_id: groupId,
    person_id: personId,
    added_by: member.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/groups/${groupId}`);
}

export async function removePersonFromGroup(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "");
  const groupPersonId = String(formData.get("group_person_id") ?? "");
  if (!groupId || !groupPersonId) throw new Error("Missing id");
  const { supabase } = await requireGroupCurator(groupId);

  const { error } = await supabase.from("group_people").delete().eq("id", groupPersonId);
  if (error) throw new Error(error.message);

  revalidatePath(`/groups/${groupId}`);
}
