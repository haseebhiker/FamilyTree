"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import { sendEmail, emailBodyToHtml } from "@/lib/email";

/**
 * One announcement email to any chosen active members ({{name}} in the
 * message becomes each person's own name). Runs as the signed-in admin —
 * their own session is what's allowed to read the members list — so it
 * needs no service-role key. Errors are RETURNED rather than thrown: a
 * thrown Server Action error reaches the browser as a stripped "Minified
 * React error #441" in production.
 */
export async function sendAnnouncementEmails(
  formData: FormData,
): Promise<{ sent: number; failed: number } | { error: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not signed in" };
    const admin = await getCurrentMember(supabase, user.id);
    if (!isAdmin(admin)) return { error: "Admins only" };

    const memberIds = formData.getAll("member_id").map(String).filter(Boolean);
    const subject = String(formData.get("subject") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    if (memberIds.length === 0) return { error: "Pick at least one person to email" };
    if (!subject || !body) return { error: "Subject and message are both required" };

    const { data: members, error } = await supabase
      .from("members")
      .select("name, email")
      .in("id", memberIds)
      .eq("status", "active");
    if (error) return { error: error.message };

    let sent = 0;
    let failed = 0;
    for (const m of members ?? []) {
      const ok = await sendEmail({
        to: m.email,
        subject,
        html: emailBodyToHtml(body.replace(/\{\{name\}\}/gi, m.name)),
      });
      if (ok) sent++;
      else failed++;
    }
    return { sent, failed };
  } catch (e) {
    console.error("[sendAnnouncementEmails]", e);
    return { error: e instanceof Error ? e.message : "Something went wrong — please try again." };
  }
}
