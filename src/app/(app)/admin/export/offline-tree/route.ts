import { NextResponse } from "next/server";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import { redactForPublicExport } from "@/lib/privacy";
import { generateOfflineTreeHtml, toOfflinePerson, toOfflineSpouse } from "@/lib/generate-offline-tree";
import type { Person, Spouse, PrivacyVisibility } from "@/lib/types";

/**
 * A single self-contained HTML file (zipped, per the ask), browsable with
 * no server — for keeping/sharing an offline copy of the tree. Redacted as
 * if viewed by a plain, non-owner, non-admin member: contact details are
 * never included, and any field marked admins_only/just_me is stripped,
 * since once this file leaves the app it's outside every access control.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const member = await getCurrentMember(supabase, user.id);
  if (!isAdmin(member)) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const [{ data: people }, { data: spouses }, { data: overrides }, { data: defaults }] = await Promise.all([
    supabase.from("people").select("*"),
    supabase.from("spouses").select("*"),
    supabase.from("field_privacy").select("person_id, field_name, visibility"),
    supabase.from("privacy_defaults").select("field_name, visibility"),
  ]);

  const redacted = redactForPublicExport(
    (people ?? []) as Person[],
    (overrides ?? []) as { person_id: string; field_name: string; visibility: PrivacyVisibility }[],
    (defaults ?? []) as { field_name: string; visibility: PrivacyVisibility }[],
  );

  const html = generateOfflineTreeHtml(
    redacted.map(toOfflinePerson),
    ((spouses ?? []) as Spouse[]).map(toOfflineSpouse),
    new Date().toLocaleString(),
  );

  const zip = new JSZip();
  zip.file("index.html", html);
  zip.file(
    "README.txt",
    "Unzip and open index.html in any browser — no internet connection or server needed.\n" +
      "This is a read-only snapshot; edits made in the live app won't appear here.\n",
  );
  const buffer = await zip.generateAsync({ type: "arraybuffer" });

  const filename = `family-tree-offline-${new Date().toISOString().slice(0, 10)}.zip`;
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
