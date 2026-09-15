import { createClient } from "@/lib/supabase/server";
import { updatePrivacyDefaults } from "@/lib/actions/privacy";
import { Card, Field, Select, Button } from "@/components/ui";
import { PRIVACY_FIELDS } from "@/lib/types";
import type { PrivacyVisibility } from "@/lib/types";

export default async function PrivacyDefaultsPage() {
  const supabase = await createClient();
  const { data: defaults } = await supabase.from("privacy_defaults").select("*");
  const byField = new Map((defaults ?? []).map((d) => [d.field_name, d.visibility as PrivacyVisibility]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Privacy Defaults</h1>
      <Card>
        <p className="mb-4 text-sm text-slate-500">
          Fallback visibility for a field when the profile has no linked member account yet to set it themselves
          (design doc §5) — e.g. a deceased ancestor, or a relative who hasn&apos;t joined.
        </p>
        <form action={updatePrivacyDefaults} className="grid gap-3 sm:grid-cols-2">
          {PRIVACY_FIELDS.map((field) => (
            <Field key={field} label={field.replace(/_/g, " ")}>
              <Select name={field} defaultValue={byField.get(field) ?? "admins_only"}>
                <option value="everyone">Everyone in Nams Family App</option>
                <option value="admins_only">Admins only</option>
                <option value="just_me">Just me</option>
              </Select>
            </Field>
          ))}
          <div className="sm:col-span-2"><Button type="submit">Save defaults</Button></div>
        </form>
      </Card>
    </div>
  );
}
