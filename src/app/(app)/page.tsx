import { createClient } from "@/lib/supabase/server";
import { TreeView, type TreeNodeData } from "@/components/tree-view";
import { Card } from "@/components/ui";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: people } = await supabase
    .from("people")
    .select("id, full_name, surname_tag, living_status, father_id, mother_id")
    .order("full_name")
    .limit(5000);

  const allPeople = (people ?? []) as TreeNodeData[];
  const roots = allPeople.filter((p) => !p.father_id && !p.mother_id);

  if (allPeople.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500">
          No one&apos;s in the tree yet. Once the legacy data is imported, it&apos;ll show up here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{allPeople.length} people</p>
      <TreeView roots={roots} allPeople={allPeople} />
    </div>
  );
}
