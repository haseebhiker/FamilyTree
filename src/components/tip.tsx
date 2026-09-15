import { getTip } from "@/lib/tips";

export function Tip({ seed }: { seed: string }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-xs font-semibold text-amber-800">💡 Tip</p>
      <p className="mt-1 text-sm text-amber-900">{getTip(seed)}</p>
    </div>
  );
}
