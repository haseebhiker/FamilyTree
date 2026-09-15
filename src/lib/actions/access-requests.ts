"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin, isSuperAdmin } from "@/lib/members";
import type { Role } from "@/lib/types";

export async function submitAccessRequest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) throw new Error("Not signed in");

  const name = String(formData.get("name") ?? "").trim();
  const relationDescription = String(formData.get("relation_description") ?? "").trim();
  const knownPersonId = String(formData.get("known_person_id") ?? "").trim() || null;
  if (!name) throw new Error("Name is required");
  if (!relationDescription) throw new Error("Please describe how you're related to the family");

  // Guards against the same double-tap-on-a-slow-connection duplicate this
  // form used to be exposed to (a plain submit button with no pending
  // state let someone fire it 2-3 times a couple seconds apart, each
  // landing as its own row an admin then had to reject one by one). The
  // page's own re-render of `existingRequest` can't catch this — a rapid
  // second submit happens before that re-render ever lands — so this has
  // to re-check fresh, right here, at submission time.
  const { data: existingPending } = await supabase
    .from("access_requests")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (existingPending) {
    revalidatePath("/not-authorized");
    return;
  }

  const { error } = await supabase.from("access_requests").insert({
    auth_user_id: user.id,
    email: user.email,
    name,
    relation_description: relationDescription,
    known_person_id: knownPersonId,
    notes: String(formData.get("notes") ?? "").trim() || null,
    status: "pending",
  });
  if (error) throw new Error(error.message);

  revalidatePath("/not-authorized");
}

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

export async function approveAccessRequest(formData: FormData) {
  const { supabase, member } = await requireAdmin();
  const requestId = String(formData.get("request_id") ?? "");
  if (!requestId) throw new Error("Missing request id");

  const { data: request } = await supabase.from("access_requests").select("*").eq("id", requestId).single();
  if (!request) throw new Error("Request not found");

  const role = String(formData.get("role") ?? "member") as Role;
  const effectiveRole = role !== "member" && !isSuperAdmin(member) ? "member" : role;
  const personId = String(formData.get("person_id") ?? "").trim() || null;

  const { error: inviteError } = await supabase.from("invites").insert({
    email: request.email,
    name: request.name,
    role: effectiveRole,
    person_id: personId,
    invited_by: member.id,
  });
  if (inviteError) throw new Error(inviteError.message);

  const { error } = await supabase
    .from("access_requests")
    .update({ status: "approved", reviewed_by: member.id, reviewed_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/access-requests");
}

export async function rejectAccessRequest(formData: FormData) {
  const { supabase, member } = await requireAdmin();
  const requestId = String(formData.get("request_id") ?? "");
  const adminNote = String(formData.get("admin_note") ?? "").trim() || null;
  if (!requestId) throw new Error("Missing request id");

  const { error } = await supabase
    .from("access_requests")
    .update({ status: "rejected", admin_note: adminNote, reviewed_by: member.id, reviewed_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  revalidatePath("/admin/access-requests");
}
