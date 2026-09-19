import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmins } from "@/lib/notify-admins";

/**
 * Once a day (see vercel.json): one summary email to the admins of whatever
 * came into the approval queue in the last 24 hours, instead of one email
 * per change — a single person doing a mass edit used to send dozens.
 * Sends nothing on a quiet day.
 */
export async function GET(request: Request) {
  // Vercel sends "Authorization: Bearer <CRON_SECRET>" when that env var is
  // set on the project. Enforced only when it IS set, so the digest works
  // before anyone has configured one.
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: recent, error }, { count: totalPending }] = await Promise.all([
    supabase
      .from("pending_changes")
      .select("change_type, submitter:members!pending_changes_submitted_by_fkey(name)")
      .eq("status", "pending")
      .gte("created_at", since),
    supabase.from("pending_changes").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!recent || recent.length === 0) return NextResponse.json({ sent: false, reason: "nothing new" });

  const bySubmitter = new Map<string, number>();
  for (const row of recent) {
    const submitter = row.submitter as unknown as { name: string } | { name: string }[] | null;
    const name = (Array.isArray(submitter) ? submitter[0]?.name : submitter?.name) ?? "Someone";
    bySubmitter.set(name, (bySubmitter.get(name) ?? 0) + 1);
  }
  const lines = [...bySubmitter.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `- ${name}: ${n} ${n === 1 ? "change" : "changes"}`);

  const body = [
    `${recent.length} ${recent.length === 1 ? "change was" : "changes were"} submitted in the last 24 hours:`,
    lines.join("\n"),
    `${totalPending ?? recent.length} in total ${(totalPending ?? recent.length) === 1 ? "is" : "are"} waiting for your approval.`,
    "Review them at https://familytree.haseeb.in/admin/pending",
  ].join("\n\n");

  await notifyAdmins(
    `${recent.length} ${recent.length === 1 ? "change is" : "changes are"} waiting for approval on Family Tree`,
    body,
  );
  return NextResponse.json({ sent: true, count: recent.length });
}
