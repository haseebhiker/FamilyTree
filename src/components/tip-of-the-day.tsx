import { getTipOfTheDay } from "@/lib/tips";

export function TipOfTheDay() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-xs font-semibold text-amber-800">💡 Tip of the day</p>
      <p className="mt-1 text-sm text-amber-900">{getTipOfTheDay()}</p>
    </div>
  );
}
