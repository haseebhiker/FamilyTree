import { createClient } from "@/lib/supabase/server";
import { AnnouncementComposer } from "@/components/announcement-composer";
import { sendAnnouncementEmails } from "@/lib/actions/announcements";

export default async function AnnouncementPage() {
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("members")
    .select("id, name, email")
    .eq("status", "active")
    .order("name");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Send an announcement</h1>
        <p className="mt-1 text-sm text-slate-500">
          One email to whoever you pick — a new feature, a thank-you, anything. Use {"{{name}}"} in the message to greet
          each person by their own name. Untick everyone but yourself first to send yourself a test copy.
        </p>
      </div>
      <AnnouncementComposer members={members ?? []} sendAnnouncementEmails={sendAnnouncementEmails} />
    </div>
  );
}
