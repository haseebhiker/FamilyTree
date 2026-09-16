import { createClient } from "@/lib/supabase/server";
import { AddPersonScreen } from "@/components/add-person-screen";

export default async function AddFamilyMemberPage() {
  const supabase = await createClient();
  const [{ data: people }, { data: spouses }] = await Promise.all([
    supabase
      .from("people")
      .select("id, full_name, preferred_name, surname_tag, father_id, mother_id")
      .is("deleted_at", null)
      .order("full_name")
      .limit(2000),
    supabase.from("spouses").select("person_a_id, person_b_id").limit(2000),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Add a Family Member</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick anyone already in the tree, then add their parent, child, sibling, or spouse — same as the "Add a
          family member" section on their profile, just without needing to go there first.
        </p>
      </div>
      <AddPersonScreen people={people ?? []} spouses={spouses ?? []} />
    </div>
  );
}
