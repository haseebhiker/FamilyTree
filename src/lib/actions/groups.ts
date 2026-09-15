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

export async function requestToJoinGroup(formData: FormData) {
  const { supabase, member } = await requireMember();
  const groupId = String(formData.get("group_id") ?? "");
  if (!groupId) throw new Error("Missing group id");

  const { error } = await supabase.from("group_memberships").insert({
    group_id: groupId,
    member_id: member.id,
    role: "member",
    status: "pending",
  });
  if (error) throw new Error(error.message);

  revalidatePath("/groups");
  revalidatePath(`/groups/${groupId}`);
}

export async function leaveGroup(formData: FormData) {
  const { supabase, member } = await requireMember();
  const groupId = String(formData.get("group_id") ?? "");
  if (!groupId) throw new Error("Missing group id");

  const { error } = await supabase
    .from("group_memberships")
    .delete()
    .eq("group_id", groupId)
    .eq("member_id", member.id);
  if (error) throw new Error(error.message);

  revalidatePath("/groups");
  revalidatePath(`/groups/${groupId}`);
}

async function requireGroupAdmin(groupId: string) {
  const { supabase, member } = await requireMember();
  const { data: membership } = await supabase
    .from("group_memberships")
    .select("role, status")
    .eq("group_id", groupId)
    .eq("member_id", member.id)
    .maybeSingle();
  const isGroupAdmin = membership?.role === "admin" && membership.status === "approved";
  if (!isGroupAdmin && !isAdmin(member)) throw new Error("Group admins only");
  return { supabase, member };
}

export async function approveGroupMembership(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "");
  const membershipId = String(formData.get("membership_id") ?? "");
  if (!groupId || !membershipId) throw new Error("Missing id");
  const { supabase, member } = await requireGroupAdmin(groupId);

  const { error } = await supabase
    .from("group_memberships")
    .update({ status: "approved", approved_by: member.id, approved_at: new Date().toISOString() })
    .eq("id", membershipId);
  if (error) throw new Error(error.message);

  revalidatePath(`/groups/${groupId}`);
}

export async function rejectGroupMembership(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "");
  const membershipId = String(formData.get("membership_id") ?? "");
  if (!groupId || !membershipId) throw new Error("Missing id");
  const { supabase } = await requireGroupAdmin(groupId);

  const { error } = await supabase.from("group_memberships").delete().eq("id", membershipId);
  if (error) throw new Error(error.message);

  revalidatePath(`/groups/${groupId}`);
}

export async function addMemberToGroup(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "");
  const personId = String(formData.get("person_id") ?? "");
  if (!groupId || !personId) throw new Error("Choose a person to add");
  const { supabase, member: actor } = await requireGroupAdmin(groupId);

  // Groups control who can see shared contact info, which only makes sense
  // for someone with an actual account — so the picker searches the full
  // 1000+ person tree, but this resolves back to that person's members
  // row (if any) rather than taking a member id directly.
  const { data: personMember } = await supabase
    .from("members")
    .select("id, name")
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (!personMember) {
    throw new Error(
      "That person hasn't signed in to the app yet, so there's no account to add to this group. Invite them from Admin > Invite Management first — once they sign in, you'll be able to add them here.",
    );
  }

  const { data: existing } = await supabase
    .from("group_memberships")
    .select("id")
    .eq("group_id", groupId)
    .eq("member_id", personMember.id)
    .maybeSingle();
  if (existing) throw new Error(`${personMember.name} is already in this group`);

  const { error } = await supabase.from("group_memberships").insert({
    group_id: groupId,
    member_id: personMember.id,
    role: "member",
    status: "approved",
    approved_by: actor.id,
    approved_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/groups/${groupId}`);
}

export async function removeMemberFromGroup(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "");
  const membershipId = String(formData.get("membership_id") ?? "");
  if (!groupId || !membershipId) throw new Error("Missing id");
  const { supabase } = await requireGroupAdmin(groupId);

  const { error } = await supabase.from("group_memberships").delete().eq("id", membershipId);
  if (error) throw new Error(error.message);

  revalidatePath(`/groups/${groupId}`);
}

export async function promoteToGroupAdmin(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "");
  const membershipId = String(formData.get("membership_id") ?? "");
  if (!groupId || !membershipId) throw new Error("Missing id");
  const { supabase } = await requireGroupAdmin(groupId);

  const { error } = await supabase.from("group_memberships").update({ role: "admin" }).eq("id", membershipId);
  if (error) throw new Error(error.message);

  revalidatePath(`/groups/${groupId}`);
}
