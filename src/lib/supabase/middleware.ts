import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { provisionMemberFromInvite } from "@/lib/members";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/not-authorized"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath = PUBLIC_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );

  if (!user) {
    if (!isPublicPath) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      return NextResponse.redirect(loginUrl);
    }
    return supabaseResponse;
  }

  // Falls back to (re-)provisioning from an invite, not just a plain read:
  // someone approved after their last sign-in (direct invite or an access
  // request) has a session that predates their members row, and the
  // /not-authorized page's own "You're approved!" step only confirms that
  // in THAT request — this is the very next one, on a fresh connection, so
  // it re-checks for real instead of trusting a bare read that raced the
  // approval and sending them right back to /not-authorized.
  const member = await provisionMemberFromInvite(supabase, user);

  if (!member) {
    if (request.nextUrl.pathname !== "/not-authorized" && !isPublicPath) {
      const notAuthorizedUrl = request.nextUrl.clone();
      notAuthorizedUrl.pathname = "/not-authorized";
      return NextResponse.redirect(notAuthorizedUrl);
    }
    return supabaseResponse;
  }

  if (request.nextUrl.pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    return NextResponse.redirect(homeUrl);
  }

  // Page-view logging deliberately does NOT live here. Next.js's <Link>
  // prefetching fires real GET requests (with headers meant to mark them
  // as prefetch) the instant a link merely renders — e.g. opening the nav
  // dropdown fetched every single link inside it, logging a burst of
  // "visits" to pages nobody looked at and adding a blocking DB write to
  // each one (confirmed live: this made opening the menu itself slow).
  // Those headers turned out unreliable to gate on here, so logging moved
  // to PageViewTracker (a client component's useEffect, mounted in
  // (app)/layout.tsx) — React only runs effects for a page that actually
  // mounted in the browser, which prefetching never triggers.

  return supabaseResponse;
}
