"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin, isSuperAdmin } from "@/lib/members";
import { sendEmail } from "@/lib/email";
import type { Role } from "@/lib/types";

/**
 * The one-time "you're approved" email — a short intro, what there is to
 * see, and (more important than the feature list) an explicit nudge to
 * add or fix data, since the tree's only as good as what people actually
 * put into it.
 */
function approvalEmailHtml(name: string, email: string): string {
  const features = [
    "See exactly how you're related to anyone in the family — the app works it out for you",
    "Search the whole family tree for anyone by name",
    "Compare any two people and see every way they're connected",
    "Browse the complete family tree, branch by branch",
  ];
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#1e293b;max-width:480px;margin:0 auto;">
      <p style="margin:0 0 1em 0;">Hi ${name},</p>
      <p style="margin:0 0 1em 0;">
        You're approved! Log in and explore the full Nams Family Tree.
      </p>
      <p style="margin:0 0 0.5em 0;">A few things you can do:</p>
      <ul style="margin:0 0 1em 0; padding-left:1.25em;">
        ${features.map((f) => `<li style="margin:0 0 0.4em 0;">${f}</li>`).join("")}
      </ul>
      <p style="margin:0 0 1em 0;">
        <strong>Most importantly</strong> — if you spot anything missing or wrong (a birthday, a relationship, a photo),
        please add it or fix it yourself, or suggest the change if you're not sure. The tree is only as good as what we all put into it.
      </p>
      <p style="margin:0 0 1em 0;">
        Sign in at <a href="https://familytree.haseeb.in" style="color:#1d4ed8;">https://familytree.haseeb.in</a>
        using this Gmail address (${email}) with Google Sign-In — no separate password needed.
      </p>
    </div>
  `;
}

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

  // Best-effort — a failed/unconfigured email should never undo an
  // approval that already succeeded.
  await sendEmail({
    to: request.email,
    subject: "You're approved for Nams Family Tree",
    html: approvalEmailHtml(request.name, request.email),
  });

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
