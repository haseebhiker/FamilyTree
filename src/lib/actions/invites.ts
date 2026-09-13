"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin, isSuperAdmin } from "@/lib/members";
import type { Role } from "@/lib/types";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const member = await getCurrentMember(supabase, user.id);
  if (!isAdmin(member)) throw new Error("Admins only");
  return { supabase, member: member! };
}

export async function createInvite(formData: FormData) {
  const { supabase, member } = await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "member") as Role;
  const personId = String(formData.get("person_id") ?? "").trim() || null;

  if (!email || !name) throw new Error("Email and name are required");

  // Only a super admin may invite someone as admin/super_admin.
  const effectiveRole = role !== "member" && !isSuperAdmin(member) ? "member" : role;

  const { error } = await supabase.from("invites").insert({
    email,
    name,
    role: effectiveRole,
    person_id: personId,
    invited_by: member.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/admin/invites");
}

export async function revokeInvite(formData: FormData) {
  const { supabase, member } = await requireAdmin();
  const inviteId = String(formData.get("invite_id") ?? "");
  if (!inviteId) throw new Error("Missing invite id");

  const { data: invite } = await supabase
    .from("invites")
    .select("role")
    .eq("id", inviteId)
    .maybeSingle();

  if (invite && invite.role !== "member" && !isSuperAdmin(member)) {
    throw new Error("Only a super admin can revoke an admin's invite");
  }

  const { error } = await supabase
    .from("invites")
    .update({ status: "revoked" })
    .eq("id", inviteId);

  if (error) throw new Error(error.message);

  // Also immediately block any already-provisioned member for this invite
  // (design doc §3: revoke blocks further logins right away). Never lets a
  // non-super-admin revoke a super admin this way.
  await supabase
    .from("members")
    .update({ status: "revoked" })
    .eq("invite_id", inviteId)
    .neq("role", "super_admin");

  revalidatePath("/admin/invites");
}
