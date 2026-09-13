import { Card } from "@/components/ui";
import { signOut } from "@/app/login/actions";
import { PendingButton } from "@/components/pending-button";

export default function NotAuthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm text-center">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">
          Not authorized
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          This Google account isn&apos;t on the family tree app&apos;s invite
          list. Contact an admin if you think this is a mistake.
        </p>
        <form action={signOut}>
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
