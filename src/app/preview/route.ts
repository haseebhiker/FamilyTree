import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveOrigin } from "@/lib/request-origin";
import { getRealMember, isAdmin, PREVIEW_COOKIE } from "@/lib/members";

/**
 * Enters or leaves "view as" debug mode:
 *
 *   /preview?as=member&next=/people/xyz   see the app as a plain member
 *   /preview?as=admin                     super admin sees it as a plain admin
 *   /preview?as=off                       back to your real role
 *
 * Gated on getRealMember, NOT getCurrentMember — the latter already has the
 * downgrade applied, so an admin previewing as a member would look like a
 * member here and be unable to turn it back off.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const as = url.searchParams.get("as") ?? "off";

  // Relative paths only — an open redirect would let a crafted link bounce
  // someone to another origin from a URL that looks like part of the app.
  const nextParam = url.searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  // The browser-visible origin, not url.origin — see resolveOrigin.
  const origin = await resolveOrigin(request);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", origin));

  const member = await getRealMember(supabase, user.id);
  if (!member || !isAdmin(member)) {
    // Not an admin: nothing to preview down from, so this is a no-op rather
    // than an error page.
    return NextResponse.redirect(new URL(next, origin));
  }

  const response = NextResponse.redirect(new URL(next, origin));
  if (as === "member" || as === "admin") {
    response.cookies.set(PREVIEW_COOKIE, as, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      // Session cookie: closing the browser drops you back to your real
      // role, so it can't be left on indefinitely by accident.
    });
  } else {
    response.cookies.delete(PREVIEW_COOKIE);
  }

  // Every page's output depends on this cookie, so the client router's cached
  // RSC payloads are all stale the moment it changes. Without this you land
  // back on the previous page still rendered at the old role until a manual
  // reload — confirmed: exiting preview left the admin controls hidden.
  revalidatePath("/", "layout");
  return response;
}
