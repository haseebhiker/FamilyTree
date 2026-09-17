import { createClient } from "@supabase/supabase-js";
import { sendEmail, emailBodyToHtml } from "@/lib/email";

/**
 * Emails every active admin/super_admin — used for anything that needs a
 * human to go review it (a new access request, a pending change). Builds
 * its own service-role client rather than taking the caller's — an access
 * request is submitted by someone who isn't a member yet, so their own
 * RLS-bound client can't read the members table's emails at all ("self or
 * admin can read members" — they're neither). Best-effort per recipient,
 * same as every other email in this app.
 */
export async function notifyAdmins(subject: string, body: string) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: admins } = await supabase
    .from("members")
    .select("email")
    .in("role", ["admin", "super_admin"])
    .eq("status", "active");

  const html = emailBodyToHtml(body);
  for (const admin of admins ?? []) {
    await sendEmail({ to: admin.email, subject, html });
  }
}
