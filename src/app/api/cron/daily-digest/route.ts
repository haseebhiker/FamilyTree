import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail, emailBodyToHtml } from "@/lib/email";
import { notifyAdmins } from "@/lib/notify-admins";

const SEND_HOUR_PACIFIC = 19;

function pacificHour(now: Date): number {
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: false }).format(now);
  return Number(hour) % 24;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * The one email job, run daily at 7pm Pacific instead of an email per
 * change (a single person doing a mass edit used to send dozens):
 *   - each admin gets one summary of what's waiting for approval, and
 *   - each person whose changes were approved (or rejected) that day gets
 *     one summary with the count, in the same thank-you tone.
 * Vercel cron only speaks UTC, so vercel.json triggers this at BOTH 02:00
 * and 03:00 UTC and this only proceeds when it's actually 7pm in Los
 * Angeles — one of the two is right in summer (PDT) and the other in
 * winter (PST).
 */
export async function GET(request: Request) {
  try {
    // Vercel sends "Authorization: Bearer <CRON_SECRET>" when that env var
    // is set on the project. Enforced only when it IS set, so this works
    // before anyone has configured one.
    const secret = process.env.CRON_SECRET;
    const authorized = !secret || request.headers.get("authorization") === `Bearer ${secret}`;
    if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const params = new URL(request.url).searchParams;
    const force = authorized && params.get("force") === "1";
    // ?force=1&dry=1: run everything except actually sending, and report who would be emailed.
    const dry = force && params.get("dry") === "1";
    const wouldSend: string[] = [];
    const now = new Date();
    if (!force && pacificHour(now) !== SEND_HOUR_PACIFIC) {
      return NextResponse.json({ sent: false, reason: "not 7pm Pacific" });
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const result = { adminDigest: false, submittersEmailed: 0 };

    // --- Admins: what's waiting for approval ---
    const { data: waiting, error: waitingError } = await supabase
      .from("pending_changes")
      .select("created_at, submitter:members!pending_changes_submitted_by_fkey(name)")
      .eq("status", "pending");
    if (waitingError) throw new Error(waitingError.message);

    if (waiting && waiting.length > 0) {
      const bySubmitter = new Map<string, number>();
      let newToday = 0;
      for (const row of waiting) {
        const submitter = row.submitter as unknown as { name: string } | { name: string }[] | null;
        const name = (Array.isArray(submitter) ? submitter[0]?.name : submitter?.name) ?? "Someone";
        bySubmitter.set(name, (bySubmitter.get(name) ?? 0) + 1);
        if (row.created_at >= since) newToday++;
      }
      const lines = [...bySubmitter.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => `- ${name}: ${n}`);
      const body = [
        `${waiting.length} ${plural(waiting.length, "change is", "changes are")} waiting for your approval${newToday > 0 ? ` (${newToday} new in the last 24 hours)` : ""}:`,
        lines.join("\n"),
        "Review them at https://familytree.haseeb.in/admin/pending",
      ].join("\n\n");
      const adminSubject = `${waiting.length} ${plural(waiting.length, "change is", "changes are")} waiting for approval on Family Tree`;
      if (dry) wouldSend.push(`admins: ${adminSubject}`);
      else await notifyAdmins(adminSubject, body);
      result.adminDigest = true;
    }

    // --- Submitters: what got decided today ---
    const { data: decided, error: decidedError } = await supabase
      .from("pending_changes")
      .select("status, submitted_by, reviewed_by")
      .in("status", ["approved", "rejected"])
      .gte("reviewed_at", since);
    if (decidedError) throw new Error(decidedError.message);

    const tally = new Map<string, { approved: number; rejected: number }>();
    for (const row of decided ?? []) {
      // An admin's own edits are auto-approved by themselves — nothing to thank them for.
      if (row.reviewed_by === row.submitted_by) continue;
      const t = tally.get(row.submitted_by) ?? { approved: 0, rejected: 0 };
      if (row.status === "approved") t.approved++;
      else t.rejected++;
      tally.set(row.submitted_by, t);
    }

    if (tally.size > 0) {
      const { data: members } = await supabase
        .from("members")
        .select("id, name, email")
        .in("id", [...tally.keys()])
        .eq("status", "active");

      for (const m of members ?? []) {
        const { approved, rejected } = tally.get(m.id)!;
        const parts = [`Hi ${m.name},`];
        if (approved > 0) {
          parts.push(
            `Thank you! ${approved} ${plural(approved, "change", "changes")} you submitted ${plural(approved, "was", "were")} approved today and ${plural(approved, "is", "are")} now live on the family tree!`,
            "Contributions like yours are exactly what keeps this tree accurate and growing, for all of us and for the generations who come after. Every change counts, however small it might seem.",
            "If you spot anything else missing or worth adding, please keep them coming.",
          );
        }
        if (rejected > 0) {
          parts.push(
            `${approved > 0 ? "Another" : ""} ${rejected} ${plural(rejected, "change", "changes")} you submitted ${plural(rejected, "wasn't", "weren't")} approved this time. Thank you for taking the time to contribute — please don't let this discourage you from submitting more. If you have questions, feel free to ask whoever reviewed ${plural(rejected, "it", "them")}. You can see all your submissions at https://familytree.haseeb.in/my-submissions`.replace(/^ /, ""),
          );
        }
        if (approved > 0) parts.push("See it at https://familytree.haseeb.in");

        const subject =
          approved === 1
            ? "Your Family Tree submission was approved"
            : approved > 1
              ? `${approved} of your Family Tree submissions were approved`
              : "An update on your Family Tree submissions";
        if (dry) {
          wouldSend.push(`${m.name}: ${subject}`);
          continue;
        }
        const ok = await sendEmail({ to: m.email, subject, html: emailBodyToHtml(parts.join("\n\n")) });
        if (ok) result.submittersEmailed++;
      }
    }

    return NextResponse.json(dry ? { dry: true, ...result, wouldSend } : { sent: true, ...result });
  } catch (e) {
    console.error("[daily-digest]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
