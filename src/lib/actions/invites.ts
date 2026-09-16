"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

  if (error) {
    if (error.code === "23505") throw new Error(`${email} has already been invited — check Invite Management.`);
    throw new Error(error.message);
  }
  revalidatePath("/admin/invites");
  // Sends the admin back to the list, where the new invite now shows up —
  // this form used to live on that same page and reset itself once the
  // list grew (a change-in-count trick); now that it's its own screen,
  // the redirect is what confirms the invite actually went out.
  redirect("/admin/invites");
}

/**
 * Links an already-signed-in member's account to a tree profile after the
 * fact (e.g. someone who joined before the "link to existing profile"
 * invite field existed). Super-admin only, matching the members table's
 * own members_block_self_escalation trigger — direct SQL can't do this
 * either outside an authenticated app session, since that trigger checks
 * is_super_admin() via auth.uid().
 */
export async function linkMemberToPerson(formData: FormData) {
  const { supabase, member } = await requireAdmin();
  if (!isSuperAdmin(member)) throw new Error("Only a super admin can link an account to a profile");

  const memberId = String(formData.get("member_id") ?? "");
  const personId = String(formData.get("person_id") ?? "");
  if (!memberId || !personId) throw new Error("Choose a profile to link");

  const { error } = await supabase.from("members").update({ person_id: personId }).eq("id", memberId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/invites");
}

/**
 * Same as linkMemberToPerson above, but usable from the "All invites" list
 * — covers both an invite nobody's accepted yet (this alone is enough:
 * accept_invite()'s insert reads person_id off the invite at that point)
 * and one that's already been accepted (updating the invite alone wouldn't
 * reach them — accept_invite() only reads the invite's person_id on the
 * INSERT branch; a returning sign-in short-circuits on a plain read of
 * their already-existing members row and never re-consults the invite —
 * so the members row needs updating directly too in that case).
 */
export async function linkInviteToPerson(formData: FormData) {
  const { supabase, member } = await requireAdmin();
  if (!isSuperAdmin(member)) throw new Error("Only a super admin can link an invite to a profile");

  const inviteId = String(formData.get("invite_id") ?? "");
  const personId = String(formData.get("person_id") ?? "");
  if (!inviteId || !personId) throw new Error("Choose a profile to link");

  const { error } = await supabase.from("invites").update({ person_id: personId }).eq("id", inviteId);
  if (error) throw new Error(error.message);

  const { error: memberError } = await supabase
    .from("members")
    .update({ person_id: personId })
    .eq("invite_id", inviteId)
    .is("person_id", null);
  if (memberError) throw new Error(memberError.message);

  revalidatePath("/admin/invites");
}

/**
 * Edits the linked member/invite record itself (name, email, role) from
 * the profile page's "Linked account" section — plus, when the account
 * came through the self-service Request Access flow, the reason text
 * they gave for how they're related, which otherwise lives only on the
 * now-decided access_requests row with no edit path of its own.
 */
export async function updateLinkedAccount(formData: FormData) {
  const { supabase, member } = await requireAdmin();
  if (!isSuperAdmin(member)) throw new Error("Only a super admin can edit a linked account");

  const source = String(formData.get("source") ?? "");
  const recordId = String(formData.get("record_id") ?? "");
  const personId = String(formData.get("person_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "member") as Role;
  if (!recordId || !personId || !name || !email) throw new Error("Name and email are required");
  if (source !== "member" && source !== "invite") throw new Error("Invalid account type");

  const { error } = await supabase.from(source === "member" ? "members" : "invites").update({ name, email, role }).eq("id", recordId);
  if (error) throw new Error(error.message);

  const accessRequestId = String(formData.get("access_request_id") ?? "");
  if (accessRequestId) {
    const relationDescription = String(formData.get("relation_description") ?? "").trim();
    if (!relationDescription) throw new Error("Relation description can't be empty");
    const { error: reqError } = await supabase
      .from("access_requests")
      .update({ relation_description: relationDescription, notes: String(formData.get("notes") ?? "").trim() || null })
      .eq("id", accessRequestId);
    if (reqError) throw new Error(reqError.message);
  }

  revalidatePath(`/people/${personId}`);
  revalidatePath("/admin/invites");
}

/**
 * Clears one specific link (a single member OR invite row) — the undo for
 * linkMemberToPerson/linkInviteToPerson. Targets one record by id rather
 * than every row that happens to point at this person_id: an accepted
 * invite normally leaves BOTH its own (now-historical) invites row and the
 * resulting members row pointing at the same profile — expected, not a
 * bug — and clearing them independently is what lets an admin tidy up the
 * stale invite row without touching the real, active member link.
 */
export async function unlinkPersonAccount(formData: FormData) {
  const { supabase, member } = await requireAdmin();
  if (!isSuperAdmin(member)) throw new Error("Only a super admin can unlink an account from a profile");

  const source = String(formData.get("source") ?? "");
  const recordId = String(formData.get("record_id") ?? "");
  const personId = String(formData.get("person_id") ?? "");
  if (!recordId || !personId) throw new Error("Missing account to unlink");
  if (source !== "member" && source !== "invite") throw new Error("Invalid account type");

  const { error } = await supabase.from(source === "member" ? "members" : "invites").update({ person_id: null }).eq("id", recordId);
  if (error) throw new Error(error.message);

  revalidatePath(`/people/${personId}`);
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
