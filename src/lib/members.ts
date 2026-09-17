import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Member, Role } from "@/lib/types";

/** Cookie holding the role an admin is previewing the site as. See previewRole(). */
export const PREVIEW_COOKIE = "preview_as";

/**
 * "View as" debug mode: lets an admin see the app the way a plain member
 * does, without a second account and without touching anyone's real role.
 *
 * It can only ever REDUCE what you see — the downgrade is applied on top of
 * the real members row, and is ignored unless that row is already an admin.
 * There is no value of this cookie that grants anything.
 *
 * IMPORTANT LIMIT: this changes what the UI renders, not what the database
 * returns. Every RLS policy still evaluates is_admin() against the real
 * auth.uid(), so admin-visible ROWS (someone else's private contact details,
 * for instance) are still fetched while previewing. Use it to check which
 * controls and sections a member sees, not to audit data visibility.
 */
async function previewRole(): Promise<Role | null> {
  try {
    const value = (await cookies()).get(PREVIEW_COOKIE)?.value;
    return value === "member" || value === "admin" ? value : null;
  } catch {
    // Not in a request scope that exposes cookies — proxy.ts reaches this
    // via provisionMemberFromInvite. No preview there, which is right: the
    // proxy only asks "is this person a member at all", never about role.
    return null;
  }
}

/**
 * The real members row, with no "view as" downgrade applied. Use this
 * wherever the ACTUAL privilege matters rather than the previewed one —
 * chiefly for leaving preview mode again.
 */
export async function getRealMember(
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
 * Reads the members row for the given auth user, if active. A revoked
 * member (design doc §3: "immediately blocks further logins") is treated
 * as if no members row exists at all.
 *
 * Applies the "view as" downgrade (see previewRole) so every page picks it
 * up from this one place rather than each screen checking for itself.
 */
export async function getCurrentMember(
  supabase: SupabaseClient,
  userId: string,
): Promise<Member | null> {
  const member = await getRealMember(supabase, userId);
  if (!member || !isAdmin(member)) return member;

  const as = await previewRole();
  if (as === "member") return { ...member, role: "member" };
  if (as === "admin" && member.role === "super_admin") return { ...member, role: "admin" };
  return member;
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

  // Deliberately the real row, not the previewed one: this runs from
  // proxy.ts, which only decides whether someone is a member at all.
  const active = await getRealMember(supabase, user.id);
  if (active) return active;

  const { data, error } = await supabase.rpc("accept_invite");
  if (error) return null;
  // accept_invite() is declared `returns members` (a row type), and
  // PL/pgSQL's `return null;` from a row-typed function does NOT come back
  // over PostgREST as a bare JSON null — it comes back as an object with
  // every column set to null. `data` is therefore truthy even when nobody
  // was found, so a bare `return data` here made EVERY unauthenticated,
  // never-invited sign-in look like a valid member to every caller of this
  // function (auth/callback, the proxy middleware) — confirmed live via a
  // disposable test account with zero invite record. Checking `data?.id`
  // is what actually distinguishes "found a row" from "found nothing".
  return data?.id ? data : null;
}

export function isAdmin(member: Member | null): boolean {
  return member?.role === "admin" || member?.role === "super_admin";
}

export function isSuperAdmin(member: Member | null): boolean {
  return member?.role === "super_admin";
}
