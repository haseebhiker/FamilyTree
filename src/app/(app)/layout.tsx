import { AskHaseebLine } from "@/components/ask-haseeb";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, getRealMember, isAdmin } from "@/lib/members";
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

  // Real row, so the banner still shows (and can be dismissed) while the
  // rest of the page is rendering as a lesser role.
  const realMember = await getRealMember(supabase, user.id);
  const previewing = isAdmin(realMember) && member.role !== realMember?.role;

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
      {previewing && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-400 px-4 py-2 text-center text-xs font-medium text-amber-950">
          <span>
            Viewing as <strong>{member.role === "member" ? "a member" : "an admin"}</strong> — admin
            controls are hidden. Your real role is unchanged.
          </span>
          {/* Plain <a>, not <Link>: entering/leaving preview changes what every
              layout and page renders, and a client-side navigation reuses the
              cached layout — which left this banner on screen above a page
              that had already flipped back to admin. A full document request
              sidesteps the router cache entirely. */}
          <a href="/preview?as=off" className="underline underline-offset-2 hover:no-underline">
            Exit preview
          </a>
        </div>
      )}
      <NavBar
        role={member.role}
        personId={member.person_id}
        pendingCount={pendingCount}
        pendingAccessRequestCount={pendingAccessRequestCount}
        openSuggestionCount={openSuggestionCount}
      />
      {/* px-4/py-6 are the real padding and always apply; the max(...) rules
          only ever ADD to them, keeping content clear of the notch in
          landscape and the home indicator at the bottom. Keeping the plain
          utilities as the floor matters: env() inside max() is dropped
          wholesale by browsers that can't parse it, which would otherwise
          leave the text flush against the edge of the screen. */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">{children}</div>
        {/* Desktop-only: this is a sidebar, and on a phone it just stacked
            below the content so every page ended with a tip card the reader
            had to scroll past. Note this is currently the ONLY surface that
            renders lib/tips.ts, so phone users now see no tips at all — if
            that matters, they'd need a home for it that isn't every page. */}
        <aside className="hidden lg:block lg:w-64 lg:shrink-0">
          <Tip seed={`${member.id}:${member.last_login_at}`} isAdmin={isAdmin(member)} />
        </aside>
      </main>
      <footer className="px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-2">
        <AskHaseebLine />
      </footer>
    </div>
  );
}
