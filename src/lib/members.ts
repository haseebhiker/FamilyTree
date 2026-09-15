import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Member } from "@/lib/types";

/**
 * Reads the members row for the given auth user, if active. A revoked
 * member (design doc §3: "immediately blocks further logins") is treated
 * as if no members row exists at all.
 */
export async function getCurrentMember(
  supabase: SupabaseClient,
  userId: string,
): Promise<Member | null> {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("id", userId)
    .eq("status", "active")
    .maybeSingle();
  // A query error (RLS denial, transient network issue, etc.) must not be
  // treated the same as "genuinely not a member" — that conflation is what
  // can turn a one-off blip into a "/" <-> "/not-authorized" redirect loop
  // for someone who actually is a valid, active member.
  if (error) console.error("[getCurrentMember] query error:", error);
  return data;
}

/**
 * First-login provisioning (design doc §3): an authenticated Google account
 * is only let in if its email matches an invite that hasn't been revoked.
 * Delegates to the accept_invite() Postgres function (schema.sql), which
 * runs with elevated privilege for this one narrow purpose so a brand-new,
 * not-yet-a-member user can still be checked against the invites table.
 */
export async function provisionMemberFromInvite(
  supabase: SupabaseClient,
  user: User,
): Promise<Member | null> {
  if (!user.email) return null;

  const active = await getCurrentMember(supabase, user.id);
  if (active) return active;

  const { data, error } = await supabase.rpc("accept_invite");
  if (error) return null;
  return data;
}

export function isAdmin(member: Member | null): boolean {
  return member?.role === "admin" || member?.role === "super_admin";
}

export function isSuperAdmin(member: Member | null): boolean {
  return member?.role === "super_admin";
}
