import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentMember } from "@/lib/members";

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

  const member = await getCurrentMember(supabase, user.id);

  if (!member) {
    // Authenticated with Google but not on the invite list (or the auth
    // callback hasn't provisioned them yet, e.g. a revoked invite).
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

  return supabaseResponse;
}
