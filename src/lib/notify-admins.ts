import { createClient } from "@supabase/supabase-js";
import { sendEmail, emailBodyToHtml } from "@/lib/email";

/**
 * Emails every active admin/super_admin — used for anything that needs a
 * human to go review it (a new access request). Best-effort and it NEVER
 * throws: this runs inside other actions (an access request is saved, THEN
 * this is called), and when it threw — supabase-js refuses to build a client
 * without SUPABASE_SERVICE_ROLE_KEY — the applicant's own submit screen
 * showed an error even though their request had been saved.
 *
 * Looking up the admin list needs the service-role client (an access-request
 * submitter isn't a member yet, so their own RLS-bound client can't read the
 * members table). If that key isn't configured, this falls back to the
 * mailbox the app sends from (GMAIL_USER), which is the owner's own address,
 * so the notice still reaches someone.
 */
export async function notifyAdmins(subject: string, body: string) {
  try {
    const html = emailBodyToHtml(body);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let recipients: string[] = [];
    if (url && key) {
      const supabase = createClient(url, key);
      const { data: admins } = await supabase
        .from("members")
        .select("email")
        .in("role", ["admin", "super_admin"])
        .eq("status", "active");
      recipients = (admins ?? []).map((a) => a.email).filter(Boolean);
    }
    if (recipients.length === 0 && process.env.GMAIL_USER) recipients = [process.env.GMAIL_USER];

    for (const to of recipients) await sendEmail({ to, subject, html });
  } catch (e) {
    console.error("[notifyAdmins] failed (continuing):", e);
  }
}
