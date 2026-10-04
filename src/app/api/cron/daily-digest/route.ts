import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmins } from "@/lib/notify-admins";

const SEND_HOUR_PACIFIC = 19;

function pacificHour(now: Date): number {
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: false }).format(now);
  return Number(hour) % 24;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * A daily 7pm Pacific reminder to admins of everything still waiting for
 * approval. The immediate "something's waiting" / "your change was approved"
 * emails are sent from pending-changes.ts as things happen; this just catches
 * anything left sitting.
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
    const result = { adminDigest: false };

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

    return NextResponse.json(dry ? { dry: true, ...result, wouldSend } : { sent: true, ...result });
  } catch (e) {
    console.error("[daily-digest]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
