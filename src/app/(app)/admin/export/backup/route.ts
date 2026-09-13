import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";

const TABLES = [
  "people",
  "spouses",
  "contact_details",
  "field_privacy",
  "invites",
  "members",
  "pending_changes",
  "audit_log",
  "privacy_defaults",
] as const;

/**
 * Full raw-data backup (design doc §10: "automatic regular backups... this
 * is irreplaceable family history"). This is intentionally unredacted —
 * only an admin can trigger it, and it's meant for disaster recovery, not
 * for sharing around.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const member = await getCurrentMember(supabase, user.id);
  if (!isAdmin(member)) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const backup: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    exported_by: member!.email,
  };

  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) return NextResponse.json({ error: `${table}: ${error.message}` }, { status: 500 });
    backup[table] = data;
  }

  const filename = `family-tree-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
