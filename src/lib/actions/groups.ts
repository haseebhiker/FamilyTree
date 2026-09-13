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
  const memberId = String(formData.get("member_id") ?? "");
  if (!groupId || !memberId) throw new Error("Missing id");
  const { supabase, member: actor } = await requireGroupAdmin(groupId);

  const { error } = await supabase.from("group_memberships").insert({
    group_id: groupId,
    member_id: memberId,
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
