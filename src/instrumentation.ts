import type { Instrumentation } from "next";

/**
 * TEMPORARY — captures the real, non-redacted server error behind the
 * recurring "Minified React error #441" screens, since production hides
 * the actual message and there's no other way to read Vercel's server
 * logs from here. Writes to audit_log (person_id/performed_by null,
 * change_type "debug_error") since that's already a table this session
 * can read via the service-role key. Remove this file, and the rows it
 * wrote, once the real cause is found.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const message = err instanceof Error ? err.message : String(err);
    const digest =
      typeof err === "object" && err !== null && "digest" in err ? String((err as { digest?: unknown }).digest) : undefined;
    const stack = err instanceof Error ? err.stack : undefined;

    await supabase.from("audit_log").insert({
      person_id: null,
      change_type: "debug_error",
      old_value: null,
      new_value: {
        message,
        digest,
        stack,
        path: request.path,
        method: request.method,
        routeType: context.routeType,
        renderSource: context.renderSource,
        routePath: context.routePath,
      },
      performed_by: null,
      note: "TEMP diagnostic instrumentation — remove after debugging #441",
    });
  } catch {
    // Never let logging failure mask the real error.
  }
};
