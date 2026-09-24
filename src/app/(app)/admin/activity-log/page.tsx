import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clearPageViewLog } from "@/lib/actions/page-view-log";
import { Card } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { LocalTime } from "@/components/local-time";
import { DisambiguatedName } from "@/components/person-name";
import { AutoSubmitCheckbox } from "@/components/auto-submit-checkbox";

const PATH_LABELS: Record<string, string> = {
  "/": "Home",
  "/tree": "Tree (list view)",
  "/tree/chart": "Tree",
  "/compare": "Compare Relationship",
  "/privacy": "Privacy Settings",
  "/admin/invites": "Admin: Invite Management",
  "/admin/people": "Admin: People Management",
  "/admin/pending": "Admin: Pending Approvals",
  "/admin/audit-log": "Admin: Audit Log",
  "/admin/login-log": "Admin: Login Log",
  "/admin/activity-log": "Admin: Activity Log",
  "/admin/access-requests": "Admin: Access Requests",
  "/admin/privacy-defaults": "Admin: Privacy Defaults",
  "/admin/export": "Admin: Data Export",
};

const PERSON_PATH = /^\/people\/([0-9a-f-]{36})$/;
const COMPARE_PATH = /^\/compare\?(.*)$/;

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<{ showMine?: string }>;
}) {
  const { showMine } = await searchParams;
  const includeMine = showMine === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defaults to hiding the viewing admin's own activity — an admin testing
  // the app generates far more entries than anyone else, burying the
  // actual "who's using this and how" signal this log exists for. The
  // checkbox lets them bring their own rows back just to sanity-check the
  // log itself is working.
  let query = supabase
    .from("page_view_log")
    .select("*, members(name)")
    .order("viewed_at", { ascending: false })
    .limit(500);
  if (!includeMine && user) {
    query = query.neq("member_id", user.id);
  }
  const { data: entries } = await query;

  const personIds = new Set<string>();
  for (const e of entries ?? []) {
    const match = e.path.match(PERSON_PATH);
    if (match) personIds.add(match[1]);
    const compareMatch = e.path.match(COMPARE_PATH);
    if (compareMatch) {
      const params = new URLSearchParams(compareMatch[1]);
      for (const id of [params.get("a"), params.get("b")]) {
        if (id) personIds.add(id);
      }
    }
  }
  const { data: people } =
    personIds.size > 0
      ? await supabase
          .from("people")
          .select("id, full_name, preferred_name, surname_tag")
          .in("id", Array.from(personIds))
      : { data: [] };
  const peopleById = new Map((people ?? []).map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Activity Log</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every page a member visits, kept for 7 days automatically (older entries clear themselves out — no
            action needed).
          </p>
          <div className="mt-2">
            <AutoSubmitCheckbox param="showMine" defaultChecked={includeMine} label="Show my own activity too" />
          </div>
        </div>
        {entries && entries.length > 0 && (
          <form action={clearPageViewLog}>
            <PendingButton
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
              pendingChildren="Clearing…"
              confirmMessage="Clear the entire activity log? This can't be undone."
            >
              Clear log
            </PendingButton>
          </form>
        )}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Page</th>
                <th className="py-2 pr-4 font-medium">Viewed (your local time)</th>
              </tr>
            </thead>
            <tbody>
              {entries?.map((e) => {
                const match = e.path.match(PERSON_PATH);
                const person = match ? peopleById.get(match[1]) : null;
                const compareMatch = e.path.match(COMPARE_PATH);
                const compareParams = compareMatch ? new URLSearchParams(compareMatch[1]) : null;
                const personA = compareParams?.get("a") ? peopleById.get(compareParams.get("a")!) : null;
                const personB = compareParams?.get("b") ? peopleById.get(compareParams.get("b")!) : null;
                return (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{e.members?.name ?? "—"}</td>
                    <td className="py-2 pr-4 text-slate-600">
                      {person ? (
                        <Link href={e.path} className="hover:underline">
                          <DisambiguatedName person={person} />
                        </Link>
                      ) : match ? (
                        <span className="italic text-slate-400">Deleted profile</span>
                      ) : compareParams ? (
                        personA && personB ? (
                          <Link href={e.path} className="flex flex-wrap items-center gap-1 hover:underline">
                            <DisambiguatedName person={personA} />
                            <span className="text-slate-400">↔</span>
                            <DisambiguatedName person={personB} />
                          </Link>
                        ) : (
                          <span className="italic text-slate-400">Compare Relationship (someone not picked yet)</span>
                        )
                      ) : (
                        (PATH_LABELS[e.path] ?? e.path)
                      )}
                    </td>
                    <td className="py-2 pr-4 text-slate-500">
                      <LocalTime iso={e.viewed_at} />
                    </td>
                  </tr>
                );
              })}
              {!entries?.length && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-slate-500">
                    No activity recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
