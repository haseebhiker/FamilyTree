import { createClient } from "@/lib/supabase/server";
import { ContactImport, type PickerPerson } from "@/components/contact-import";

export default async function ContactImportPage() {
  const supabase = await createClient();
  const people: PickerPerson[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("people")
      .select("id, public_no, full_name, preferred_name, surname_tag, other_names")
      .is("deleted_at", null)
      .order("full_name")
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    people.push(...(data as PickerPerson[]));
    if (data.length < 1000) break;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Import contacts</h1>
        <p className="mt-1 text-sm text-slate-500">
          Add phone numbers and emails from your phone&apos;s contacts to the right people in the tree. Only the contacts you tick are
          saved, and they are saved as <b>admin-only</b> (the person can choose to share theirs later). Everyone else in your file
          is ignored and never stored.
        </p>
      </div>
      <details className="rounded-lg border border-slate-200 bg-white text-sm text-slate-700">
        <summary className="cursor-pointer px-4 py-3 font-medium text-slate-900">How to get your contacts file</summary>
        <div className="space-y-2 border-t border-slate-100 px-4 py-3">
          <p>
            <b>iPhone (iCloud):</b> on a computer open <b>icloud.com/contacts</b> and sign in. Click any contact, press{" "}
            <b>Ctrl+A</b> (or Cmd+A) to select all, click the gear icon at the bottom left, and choose <b>Export vCard</b>.
          </p>
          <p>
            <b>Gmail contacts:</b> open <b>contacts.google.com</b>, tick the box at the top to select all, click the three dots,
            choose <b>Export</b>, and pick <b>vCard</b>.
          </p>
          <p>Then choose that .vcf file below.</p>
        </div>
      </details>
      <ContactImport people={people} />
    </div>
  );
}
