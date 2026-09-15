import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, Field, Input, Textarea, Button, Badge } from "@/components/ui";
import { signOut } from "@/app/login/actions";
import { PendingButton } from "@/components/pending-button";
import { submitAccessRequest } from "@/lib/actions/access-requests";

export default async function NotAuthorizedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Retry provisioning — an admin may have approved a request (or added an
  // invite) since this session started, so this session's own sign-in
  // doesn't need to happen again for it to take effect.
  const { data: member } = await supabase.rpc("accept_invite");

  // Deliberately not an automatic redirect("/") here: if the plain
  // members-table read that the app layout relies on ever disagrees with
  // what this SECURITY DEFINER call just saw (e.g. a transient blip), an
  // auto-redirect would bounce right back here and loop forever. A manual
  // "Continue" click turns that failure mode into "click again", not
  // ERR_TOO_MANY_REDIRECTS.
  if (member) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <Card className="w-full max-w-md text-center">
          <h1 className="mb-1 text-xl font-semibold text-slate-900">You&apos;re approved!</h1>
          <p className="mb-6 text-sm text-slate-500">
            Your access to the family tree has been set up.
          </p>
          <Link
            href="/"
            className="inline-flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Continue to the family tree
          </Link>
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
          <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Your request is submitted and waiting on an admin. Check back later, or reload this page after they&apos;ve
            reviewed it.
          </p>
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
