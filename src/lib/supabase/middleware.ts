import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { provisionMemberFromInvite } from "@/lib/members";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/not-authorized"];

/**
 * True for a request that represents someone actually landing on a page —
 * not a background prefetch (Next.js fires a real GET, marked with this
 * header, the instant a <Link> scrolls into view or gets hovered/focused,
 * well before anyone actually navigates there) and not a form submission
 * (Server Actions POST to the current page's own URL, which would
 * otherwise double-count as a second "view" of a page already logged on
 * its initial GET).
 */
function isRealPageView(request: NextRequest): boolean {
  if (request.method !== "GET") return false;
  if (request.headers.get("next-router-prefetch")) return false;
  if (request.headers.get("purpose") === "prefetch") return false;
  if (request.headers.get("sec-purpose")?.includes("prefetch")) return false;
  return true;
}

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

  if (isRealPageView(request)) {
    // No .select() here — chaining one would ask Postgres to hand the row
    // back via RETURNING, which itself needs a matching SELECT policy.
    // page_view_log's only SELECT policy is admin-only, so a non-admin's
    // insert would look like it failed (a RETURNING check violation still
    // reports as the row-level security error) even though the insert
    // itself was fine. Confirmed the hard way debugging the identical
    // shape of bug on login_log earlier today.
    await supabase.from("page_view_log").insert({ member_id: member.id, path: request.nextUrl.pathname });
    // Rolling 7-day retention, same opportunistic-delete-on-insert pattern
    // as login_log — done probabilistically here (page views are far more
    // frequent than sign-ins) so most requests skip the extra query.
    if (Math.random() < 0.02) {
      await supabase.from("page_view_log").delete().lt("viewed_at", new Date(Date.now() - 7 * 86400000).toISOString());
    }
  }

  return supabaseResponse;
}
