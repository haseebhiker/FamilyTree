import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isSuperAdmin } from "@/lib/members";
import { Card } from "@/components/ui";

const TABS = [
  { key: "overall", label: "Overall" },
  { key: "edits", label: "Edits" },
  { key: "adds", label: "Adds" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const TAB_BLURB: Record<TabKey, string> = {
  overall: "Everyone who's helped keep the tree accurate and growing — edits and additions together.",
  edits: "Most approved edits to existing profiles.",
  adds: "Most approved additions of new family members.",
};

interface Row {
  member_id: string;
  name: string;
  edits: number;
  adds: number;
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "overall";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMember(supabase, user!.id);
  const showCounts = isSuperAdmin(member);

  const { data } = await supabase.rpc("contribution_leaderboard");
  const score = (r: Row) => (tab === "edits" ? r.edits : tab === "adds" ? r.adds : r.edits + r.adds);
  const top = ((data ?? []) as Row[])
    .filter((r) => score(r) > 0)
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
    .slice(0, 5);

  // Tied counts share a rank (1, 1, 3) — ranks shown even when the counts themselves aren't.
  const ranks = top.map((r, i) => top.findIndex((o) => score(o) === score(r)) + 1 || i + 1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Leaderboard</h1>
        <p className="mt-1 text-sm text-slate-500">{TAB_BLURB[tab]}</p>
      </div>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "overall" ? "/leaderboard" : `/leaderboard?tab=${t.key}`}
            className={`flex-1 rounded-md border px-2 py-1.5 text-center text-sm font-medium ${
              tab === t.key
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <Card>
        {top.length === 0 ? (
          <p className="text-sm text-slate-500">No approved contributions yet.</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {top.map((r, i) => (
              <li key={r.member_id} className="flex items-center gap-3 py-2.5">
                <span className="w-6 text-center text-lg font-semibold text-slate-400">{ranks[i]}</span>
                <span className="flex-1 text-sm font-medium text-slate-900">{r.name}</span>
                {showCounts && (
                  <span className="text-sm text-slate-500">
                    {score(r)}
                    {tab === "overall" && (
                      <span className="ml-2 text-xs text-slate-400">
                        {r.edits} edits · {r.adds} adds
                      </span>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
