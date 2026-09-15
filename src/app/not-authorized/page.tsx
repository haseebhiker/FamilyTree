import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { Card, Field, Input, Textarea, Button, Badge } from "@/components/ui";
import { signOut } from "@/app/login/actions";
import { PendingButton } from "@/components/pending-button";
import { submitAccessRequest } from "@/lib/actions/access-requests";
import { ApprovedReloadGuard } from "@/components/approved-reload-guard";
import { provisionMemberFromInvite } from "@/lib/members";

export default async function NotAuthorizedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Retry provisioning — an admin may have approved a request (or added an
  // invite) since this session started, so this session's own sign-in
  // doesn't need to happen again for it to take effect. Goes through the
  // shared helper rather than calling the accept_invite() RPC directly:
  // that RPC is declared to return a `members` ROW, and PL/pgSQL's
  // `return null;` from a row-typed function comes back over PostgREST as
  // an object with every column null, not a bare JSON null — a raw
  // `const { data: member } = await supabase.rpc("accept_invite")` followed
  // by `if (member)` was therefore true for EVERY signed-in Google account,
  // invited or not. Confirmed live via a disposable test account with zero
  // invite record, which this exact code path told "You're approved!".
  const member = await provisionMemberFromInvite(supabase, user);

  // Deliberately not an automatic redirect("/") here: if the plain
  // members-table read that the app layout relies on ever disagrees with
  // what this SECURITY DEFINER call just saw (e.g. a transient blip), an
  // auto-redirect would bounce right back here and loop forever. A manual
  // "Continue" click turns that failure mode into "click again", not
  // ERR_TOO_MANY_REDIRECTS.
  if (member) {
    // Absolute, not "/" — reached almost exclusively from a messaging app's
    // in-app browser (WhatsApp, SMS), and those have repeatedly shown a
    // stuck/blank screen on this exact link even after switching it to a
    // plain <a> (a real page load, not next/link's JS-driven transition).
    // A relative URL asks the browser to resolve it against whatever base
    // it thinks the current page has, which is exactly the kind of thing
    // an embedded webview gets wrong; spelling out the full origin removes
    // that step entirely. The meta-refresh is a second, independent path
    // to the same place that doesn't depend on the tap/click registering
    // at all, in case that's the part failing.
    const host = (await headers()).get("host");
    const continueUrl = host ? `${host.includes("localhost") ? "http" : "https"}://${host}/` : "/";
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <meta httpEquiv="refresh" content={`4;url=${continueUrl}`} />
        <ApprovedReloadGuard />
        <Card className="w-full max-w-md text-center">
          <h1 className="mb-1 text-xl font-semibold text-slate-900">You&apos;re approved!</h1>
          <p className="mb-6 text-sm text-slate-500">
            Your access to the family tree has been set up.
          </p>
          <a
            href={continueUrl}
            className="inline-flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Continue to the family tree
          </a>
          <p className="mt-3 text-xs text-slate-400">You&apos;ll be taken there automatically in a few seconds.</p>
        </Card>
      </main>
    );
  }

  const { data: existingRequest } = await supabase
    .from("access_requests")
    .select("*")
    .eq("auth_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <Card className="w-full max-w-md">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Not on the invite list yet</h1>
        <p className="mb-6 text-sm text-slate-500">
          This Google account ({user.email}) isn&apos;t on the family tree app&apos;s invite list. If you&apos;re
          family, request access below — an admin reviews every request before you&apos;re let in.
        </p>

        {existingRequest?.status === "pending" && (
          <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <p className="mb-2">Your request is submitted and waiting on an admin.</p>
            <a
              href="/not-authorized"
              className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              Check status
            </a>
          </div>
        )}

        {existingRequest?.status === "rejected" && (
          <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            <Badge className="mb-1 bg-red-100 text-red-800">Previous request not approved</Badge>
            {existingRequest.admin_note && <p className="mt-1">{existingRequest.admin_note}</p>}
          </div>
        )}

        {existingRequest?.status !== "pending" && (
          <form action={submitAccessRequest} className="space-y-3">
            <Field label="Your name">
              <Input name="name" required defaultValue={user.user_metadata?.full_name ?? ""} />
            </Field>
            <Field label="How are you related to the family?">
              <Textarea
                name="relation_description"
                rows={2}
                required
                placeholder="e.g. I'm Haseeb's cousin — my mother is Amina Haseeb"
              />
            </Field>
            <Field label="Anything else? (optional)">
              <Textarea name="notes" rows={2} />
            </Field>
            <Button type="submit" className="w-full">
              {existingRequest?.status === "rejected" ? "Submit another request" : "Request access"}
            </Button>
          </form>
        )}

        <form action={signOut} className="mt-4">
          <PendingButton
            className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            pendingChildren="Signing out…"
          >
            Sign out
          </PendingButton>
        </form>
      </Card>
    </main>
  );
}
