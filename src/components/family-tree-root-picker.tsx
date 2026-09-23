"use client";

import { useRouter } from "next/navigation";
import { PersonPicker, type PersonOption } from "@/components/person-picker";

/** Jumps the Family Tree Chart page to a new root by navigating to ?root=<id> — the chart itself is a server-rendered subtree, so re-centering on an arbitrary person (not just one already on screen) has to go through a real navigation rather than client state. */
export function FamilyTreeRootPicker({ people }: { people: PersonOption[] }) {
  const router = useRouter();
  return (
    <div className="w-72">
      <PersonPicker
        name="root_picker"
        people={people}
        placeholder="Jump to a person…"
        onSelect={(id) => {
          if (id) router.push(`/admin/family-tree?root=${id}`);
        }}
      />
    </div>
  );
}
