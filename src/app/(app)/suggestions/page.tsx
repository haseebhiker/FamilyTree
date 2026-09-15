import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import { Card, Field, Textarea } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { submitSuggestion, updateSuggestionStatus } from "@/lib/actions/suggestions";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  reviewed: "Reviewed",
  done: "Done",
};

const STATUS_STYLE: Record<string, string> = {
  open: "bg-amber-100 text-amber-800",
  reviewed: "bg-blue-100 text-blue-800",
  done: "bg-green-100 text-green-800",
};

export default async function SuggestionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const member = await getCurrentMember(supabase, user.id);
  if (!member) redirect("/not-authorized");

  const admin = isAdmin(member);

  const query = supabase
    .from("suggestions")
    .select("id, message, status, created_at, member_id, members(name, email)")
    .order("created_at", { ascending: false });
  const { data: suggestions } = admin ? await query : await query.eq("member_id", member.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Suggestions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Have an idea for the app, or something that&apos;s not working right? Let us know.
        </p>
      </div>

      <Card>
        <form action={submitSuggestion} className="space-y-3">
          <Field label="Your suggestion">
            <Textarea name="message" rows={4} required placeholder="What would make this app better?" />
          </Field>
          <PendingButton
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            pendingChildren="Submitting…"
          >
            Submit
          </PendingButton>
        </form>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">{admin ? "All suggestions" : "Your suggestions"}</h2>
        {(suggestions ?? []).length === 0 && <p className="text-sm text-slate-400">Nothing here yet.</p>}
        {(suggestions ?? []).map((s) => {
          const submitter = Array.isArray(s.members) ? s.members[0] : s.members;
          return (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap text-sm text-slate-800">{s.message}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {admin && submitter ? `${submitter.name} — ` : ""}
                    {new Date(s.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLE[s.status] ?? "bg-slate-100 text-slate-600"}`}>
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
              </div>
              {admin && (
                <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                  {s.status !== "reviewed" && (
                    <form action={updateSuggestionStatus}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="status" value="reviewed" />
                      <PendingButton className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-200">
                        Mark reviewed
                      </PendingButton>
                    </form>
                  )}
                  {s.status !== "done" && (
                    <form action={updateSuggestionStatus}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="status" value="done" />
                      <PendingButton className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-200">
                        Mark done
                      </PendingButton>
                    </form>
                  )}
                  {s.status !== "open" && (
                    <form action={updateSuggestionStatus}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="status" value="open" />
                      <PendingButton className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-200">
                        Reopen
                      </PendingButton>
                    </form>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
