import { createClient } from "@/lib/supabase/server";
import { clearLoginLog } from "@/lib/actions/login-log";
import { Card } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";

export default async function LoginLogPage() {
  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("login_log")
    .select("*, members(name)")
    .order("logged_in_at", { ascending: false })
    .limit(500);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Login Log</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every sign-in, kept for 30 days automatically (older entries clear themselves out — no action needed).
          </p>
        </div>
        {entries && entries.length > 0 && (
          <form action={clearLoginLog}>
            <PendingButton
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
              pendingChildren="Clearing…"
              confirmMessage="Clear the entire login log? This can't be undone."
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
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Signed in</th>
              </tr>
            </thead>
            <tbody>
              {entries?.map((e) => (
                <tr key={e.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{e.members?.name ?? "—"}</td>
                  <td className="py-2 pr-4 text-slate-600">{e.email}</td>
                  <td className="py-2 pr-4 text-slate-500">{new Date(e.logged_in_at).toLocaleString()}</td>
                </tr>
              ))}
              {!entries?.length && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-slate-500">
                    No sign-ins recorded yet.
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
