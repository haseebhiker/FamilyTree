import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import { NavBar } from "@/components/nav-bar";
import { Tip } from "@/components/tip";
import { PageViewTracker } from "@/components/page-view-tracker";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const member = await getCurrentMember(supabase, user.id);
  if (!member) redirect("/not-authorized");

  let pendingCount = 0;
  let pendingAccessRequestCount = 0;
  let openSuggestionCount = 0;
  if (isAdmin(member)) {
    const [{ count: changeCount }, { count: requestCount }, { count: suggestionCount }] = await Promise.all([
      supabase.from("pending_changes").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("access_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("suggestions").select("id", { count: "exact", head: true }).eq("status", "open"),
    ]);
    pendingCount = changeCount ?? 0;
    pendingAccessRequestCount = requestCount ?? 0;
    openSuggestionCount = suggestionCount ?? 0;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <PageViewTracker />
      <NavBar
        role={member.role}
        personId={member.person_id}
        pendingCount={pendingCount}
        pendingAccessRequestCount={pendingAccessRequestCount}
        openSuggestionCount={openSuggestionCount}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">{children}</div>
        <aside className="lg:w-64 lg:shrink-0">
          <Tip seed={`${member.id}:${member.last_login_at}`} isAdmin={isAdmin(member)} />
        </aside>
      </main>
    </div>
  );
}
