import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, isAdmin } from "@/lib/members";
import { QuickEditTable } from "@/components/quick-edit-table";

export default async function QuickEditPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMember(supabase, user!.id);
  const admin = isAdmin(member);

  const { data: people } = await supabase
    .from("people")
    .select(
      "id, full_name, preferred_name, surname_tag, gender, living_status, birth_year, birth_month, birth_day, birth_order, father_id, mother_id",
    )
    .is("deleted_at", null)
    .order("full_name")
    .limit(2000);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Quick Edit</h1>
        <p className="mt-1 text-sm text-slate-500">
          {admin
            ? "A fast way to fill in the basics across many profiles at once. Change a field and it saves as soon as you move to the next one — no separate submit step."
            : "A fast way to fill in the basics across many profiles at once. Change a field and it's submitted as soon as you move to the next one — an admin reviews it before it shows up on the actual profile, same as any other suggested edit."}
        </p>
      </div>
      <QuickEditTable initialPeople={people ?? []} />
    </div>
  );
}
